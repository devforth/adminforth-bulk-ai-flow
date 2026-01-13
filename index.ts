import { AdminForthPlugin, Filters } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthComponentDeclaration, AdminForthResource } from "adminforth";
import { suggestIfTypo } from "adminforth";
import type { PluginOptions } from './types.js';
import Handlebars from 'handlebars';
import { RateLimiter } from "adminforth";
import { randomUUID } from "crypto";

const STUB_MODE = false;
const jobs = new Map(); 
export default class  BulkAiFlowPlugin extends AdminForthPlugin {
  options: PluginOptions;
  uploadPlugin: AdminForthPlugin;
  totalCalls: number;
  totalDuration: number;
  rateLimiters: Record<string, RateLimiter> = {};

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;

    // for calculating average time
    this.totalCalls = 0;
    this.totalDuration = 0;
  }

  // Compile Handlebars templates in outputFields using record fields as context
  private async compileTemplates<T extends Record<string, any>>(
    source: T,
    record: any,
    valueSelector: (value: T[keyof T]) => string
  ): Promise<Record<string, string>> {
    if (this.options.provideAdditionalContextForRecord) {
      const additionalFields = await this.options.provideAdditionalContextForRecord({ record, adminUser: null, resource: this.resourceConfig });
      record = { ...record, ...additionalFields };
    }
    const compiled: Record<string, string> = {};
    for (const [key, value] of Object.entries(source)) {
      const templateStr = valueSelector(value);
      try {
        const tpl = Handlebars.compile(templateStr);
        compiled[key] = tpl(record);
      } catch {
        compiled[key] = templateStr;
      }
    }
    return compiled;
  }

  private async compileOutputFieldsTemplates(record: any, customPrompt? : string) {
    return await this.compileTemplates(customPrompt ? JSON.parse(customPrompt) :this.options.fillFieldsFromImages, record, v => String(v));
  }

  private async compileOutputFieldsTemplatesNoImage(record: any, customPrompt? : string) {
    return await this.compileTemplates(customPrompt ? JSON.parse(customPrompt) : this.options.fillPlainFields, record, v => String(v));
  }

  private async compileGenerationFieldTemplates(record: any, customPrompt? : string) {
    return await this.compileTemplates(customPrompt ? JSON.parse(customPrompt) : this.options.generateImages, record, v => String(customPrompt ? v : v.prompt));
  }

  private removeFromPromptFilledFields(compiledOutputFields: Record<string, string>, record: Record<string, any>): Record<string, string> {
    const newCompiledOutputFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (compiledOutputFields[key]) {
        if (value !== null && value !== undefined && value !== '') {
          continue;
        }
        newCompiledOutputFields[key] = compiledOutputFields[key];
      }
    }
    return newCompiledOutputFields;
  }

  private async checkRateLimit(field: string, fieldNameRateLimit: string | undefined, headers: Record<string, string | string[] | undefined>): Promise<void | { error?: string; }> {
    if (fieldNameRateLimit) {
      // rate limit
      // const { error } = RateLimiter.checkRateLimit(
      //   field,
      //   fieldNameRateLimit,
      //   this.adminforth.auth.getClientIp(headers),
      // );
      if (!this.rateLimiters[field]) {
        this.rateLimiters[field] = new RateLimiter(fieldNameRateLimit);
      }
      if (!await this.rateLimiters[field].consume(`${field}-${this.adminforth.auth.getClientIp(headers)}`)) {
        return { error: "Rate limit exceeded" };
      }
    }
  }

  private getPromptForImageAnalysis(compiledOutputFields: Record<string, string>) {
    const prompt = `Analyze the following image(s) and return a single JSON in format like: {'param1': 'value1', 'param2': 'value2'}. 
      Do NOT return array of objects. Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
      Only return valid JSON. Do NOT wrap in \`\`\` or \`\`\`json. Do not add any extra text. Do not return prompt in response 
      Each object must contain the following fields: ${JSON.stringify(compiledOutputFields)} Use the exact field names. If it's number field - return only number.
      Image URLs:`;
    return prompt;
  }

  private getPromptForPlainFields(compiledOutputFields: Record<string, string>){
    const prompt = `Generate the values of fields in object by using next prompts (key is field name, value is prompt): 
      ${JSON.stringify(compiledOutputFields)} In output object use the same field names (keys) as in input.
      Return a single valid passable JSON object in format like: {"meta_title": "generated_value"}.
      Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
      Do NOT wrap in \`\`\` or \`\`\`json. Do not add any extra text. Do not return prompt in response`;
    return prompt;
  }

  private async analyze_image(jobId: string, recordId: string, adminUser: any, headers: Record<string, string | string[] | undefined>, customPrompt? : string, filterFilledFields: boolean = true) {
    const selectedId = recordId;
    let isError = false;
    // Fetch the record using the provided ID
    const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
    const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(primaryKeyColumn.name, selectedId)] );

    //recieve image URLs to analyze
    const attachmentFiles = await this.options.attachFiles({ record: record });
    if (STUB_MODE) {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 8000) + 1000));
      const fakeError = Math.random() < 0.5; // 50% chance of error
      if (attachmentFiles.length === 0) {
        jobs.set(jobId, { status: 'failed', error: 'No source images found' });
      } else if (!fakeError) {
        jobs.set(jobId, { status: 'completed', result: {} });
      } else {
        jobs.set(jobId, { status: 'failed', error: 'AI provider refused to analyze images' });
      }
      return {};
    } else if (attachmentFiles.length !== 0) {
      try {
        for (const fileUrl of attachmentFiles) {
          new URL(fileUrl);
        }
      } catch (e) {
        jobs.set(jobId, { status: 'failed', error: 'One of the image URLs is not valid' });
        return { ok: false, error: 'One of the image URLs is not valid' };
      }
      //create prompt for OpenAI
      const compiledOutputFields = await this.compileOutputFieldsTemplates(record, customPrompt);
      const filteredCompiledOutputFields = filterFilledFields ? this.removeFromPromptFilledFields(compiledOutputFields, record) : compiledOutputFields;
      
      if (Object.keys(filteredCompiledOutputFields).length === 0) {
        jobs.set(jobId, { status: 'completed', result: {} });
        return { ok: true };
      }
        
      const prompt = this.getPromptForImageAnalysis(filteredCompiledOutputFields);

      //send prompt to OpenAI and get response
      let chatResponse;
      try {
        chatResponse = await this.options.visionAdapter.generate({ prompt, inputFileUrls: attachmentFiles });
      } catch (e) {
        isError = true;
        jobs.set(jobId, { status: 'failed', error: 'AI provider refused to analyze images' });
        return { ok: false, error: 'AI provider refused to analyze images' };
      }
      if (!isError) {
        const resp: any = (chatResponse as any).response;
        const topLevelError = (chatResponse as any).error;
        if (topLevelError || resp?.error) {
          jobs.set(jobId, { status: 'failed', error: `ERROR: ${JSON.stringify(topLevelError.message || resp?.error.message)}` });
          return { ok: false, error: `ERROR: ${JSON.stringify(topLevelError.message || resp?.error.message)}` };
        }

        const textOutput = resp?.output?.[0]?.content?.[0]?.text ?? resp?.output_text ?? resp?.choices?.[0]?.message?.content;
        if (!textOutput || typeof textOutput !== 'string') {
          jobs.set(jobId, { status: 'failed', error: 'Unexpected AI response format' });
        }

        //parse response and update record
        let resData;
        try {
          resData = JSON.parse(textOutput);
        } catch (e) {
          jobs.set(jobId, { status: 'failed', error: 'AI response is not valid JSON. Probably attached invalid image URL', aiResponse: textOutput });
          return { ok: false, error: 'AI response is not valid JSON. Probably attached invalid image URL', aiResponse: textOutput };
        }
        const result = resData;
        jobs.set(jobId, { status: 'completed', result });
        return { ok: true };
      }
    } else {
      jobs.set(jobId, { status: 'failed', error: "No source images found" });
      return { ok: false, error: "No source images found" };
    }

  }

  private async analyzeNoImages(jobId: string, recordId: string, adminUser: any, headers: Record<string, string | string[] | undefined>, customPrompt? : string, filterFilledFields: boolean = true) {
    const selectedId = recordId;
    let isError = false;
    if (STUB_MODE) {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20000) + 1000));
      jobs.set(jobId, { status: 'completed', result: {} });
      jobs.set(jobId, { status: 'failed', error: `ERROR: test error` });
      return { ok: false, error: 'test error' };
    } else {
      const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
      const record = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, selectedId)] );

      const compiledOutputFields = await this.compileOutputFieldsTemplatesNoImage(record, customPrompt);

      const filteredCompiledOutputFields = filterFilledFields ? this.removeFromPromptFilledFields(compiledOutputFields, record) : compiledOutputFields;

      if (Object.keys(filteredCompiledOutputFields).length === 0) {
        jobs.set(jobId, { status: 'completed', result: {} });
        return { ok: true };
      }
      const prompt = this.getPromptForPlainFields(filteredCompiledOutputFields);
      //send prompt to OpenAI and get response
      const numberOfTokens = this.options.fillPlainFieldsMaxTokens ? this.options.fillPlainFieldsMaxTokens : 1000;
      let resp: any;
      try {
        const { content: chatResponse, error: topLevelError } = await this.options.textCompleteAdapter.complete(prompt, [], numberOfTokens);
        // resp = (chatResponse as any).response;
        if (topLevelError || resp?.error) {
          isError = true;
          jobs.set(jobId, { status: 'failed', error: `ERROR: ${JSON.stringify(topLevelError)}` });
          return { ok: false, error: `ERROR: ${JSON.stringify(topLevelError)}` };
        }
        resp = chatResponse
      } catch (e) {
        isError = true;
        jobs.set(jobId, { status: 'failed', error: 'AI provider refused to fill fields' });
        return { ok: false, error: 'AI provider refused to fill fields' };
      }
      let resData;
        try {
          resData = JSON.parse(resp);
        } catch (e) {
          jobs.set(jobId, { status: 'failed', error: 'AI response is not valid JSON', aiResponse: resp });
          return { ok: false, error: 'AI response is not valid JSON', aiResponse: resp };
        }
      const result = resData;
      jobs.set(jobId, { status: 'completed', result });
      return { ok: true };
    }
  }

  private async initialImageGenerate(jobId: string, recordId: string, adminUser: any, headers: Record<string, string | string[] | undefined>, customPrompt? : string, filterFilledFields: boolean = true) {
    const selectedId = recordId;
    let isError = false;
    const start = +new Date();
    const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(this.resourceConfig.columns.find(c => c.primaryKey)?.name, selectedId)]);
    let attachmentFiles
    if(!this.options.attachFiles){
      attachmentFiles = [];
    } else {
      attachmentFiles = await this.options.attachFiles({ record });
      try {
        for (const fileUrl of attachmentFiles) {
          new URL(fileUrl);
        }
      } catch (e) {
        jobs.set(jobId, { status: 'failed', error: 'One of the image URLs is not valid' });
        return { ok: false, error: 'One of the image URLs is not valid' };
      }
    }
    const fieldTasks = Object.keys(this.options?.generateImages || {}).map(async (key) => {
      if ( record[key] && filterFilledFields ) {
        return { key, images: [] };
      }
      const prompt = (await this.compileGenerationFieldTemplates(record, customPrompt))[key];
      let images;
        if (this.options.attachFiles && attachmentFiles.length === 0) {
          isError = true;
          jobs.set(jobId, { status: 'failed', error: "No source images found" });
          return { key, images: [] };
        } else {
          if (STUB_MODE) {
            await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20000) + 1000));
            const fakeError = Math.random() < 0.5; // 50% chance of error
            if (!fakeError) {
              images = `https://pic.re/image`;
            } else {
              isError = true;
              jobs.set(jobId, { status: 'failed', error: 'AI provider refused to generate image' });
            }
          } else {
            let generationAdapter;
            if (this.options.generateImages[key].adapter) {
              generationAdapter = this.options.generateImages[key].adapter;
            } else {
              generationAdapter = this.options.imageGenerationAdapter;
            }
            let resp;
            try {
              resp = await generationAdapter.generate(
                {
                  prompt,
                  inputFiles: attachmentFiles,
                  n: 1,
                  size: this.options.generateImages[key].outputSize,
                }
              )
              if (resp.error) {
                isError = true;
                jobs.set(jobId, { status: 'failed', error: `AI provider refused to generate image: ${JSON.stringify(resp.error)}` });
                return { key, images: [] };
              }
            } catch (e) {
              jobs.set(jobId, { status: 'failed', error: "AI provider refused to generate image" });
              isError = true;
              return { key, images: [] };
            }
            images = resp.imageURLs[0];
          }
        return { key, images };
      }
    });

    const fieldResults = await Promise.all(fieldTasks);
    const recordResult: Record<string, string[]> = {};

    fieldResults.forEach(({ key, images }) => {
      recordResult[key] = images;
    });

    const result = recordResult;
    
    if (!isError) {
      this.totalCalls++;
      this.totalDuration += (+new Date() - start) / 1000;
      jobs.set(jobId, { status: 'completed', result });
      return { ok: true }
    } else {
      return { ok: false, error: 'Error during image generation' };
    }
  }
  
  private async regenerateImage(jobId: string, recordId: string, fieldName: string, prompt: string, adminUser: any, headers: Record<string, string | string[] | undefined>) {
    const Id = recordId;
    let isError = false;
    if (await this.checkRateLimit(fieldName, this.options.generateImages[fieldName].rateLimit, headers)) {
      jobs.set(jobId, { status: 'failed', error: "Rate limit exceeded" });
      return { error: "Rate limit exceeded" };
    }
    const start = +new Date();
    const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(this.resourceConfig.columns.find(c => c.primaryKey)?.name, Id)]);
    let attachmentFiles
      if(!this.options.attachFiles){
        attachmentFiles = [];
      } else {
        attachmentFiles = await this.options.attachFiles({ record });
      }
    const images = await Promise.all(
      (new Array(this.options.generateImages[fieldName].countToGenerate)).fill(0).map(async () => {
        if (this.options.attachFiles && attachmentFiles.length === 0) {
          isError = true;
          jobs.set(jobId, { status: 'failed', error: "No source images found" });
          return null;
        }
        if (STUB_MODE) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          jobs.set(jobId, { status: 'completed', result: {} });
          return `https://pic.re/image`;
        }

        let generationAdapter;
        if (this.options.generateImages[fieldName].adapter) {
          generationAdapter = this.options.generateImages[fieldName].adapter;
        } else {
          generationAdapter = this.options.imageGenerationAdapter;
        }
        let resp;
        try {
          resp = await generationAdapter.generate(
            {
              prompt,
              inputFiles: attachmentFiles,
              n: 1,
              size: this.options.generateImages[fieldName].outputSize,
            }
          )
          if (resp.error) {
            isError = true;
            jobs.set(jobId, { status: 'failed', error: `AI provider refused to generate image: ${JSON.stringify(resp.error)}` });
            return [];
          }
        } catch (e) {
          jobs.set(jobId, { status: 'failed', error: "AI provider refused to generate image" });
          isError = true;
          return [];
        }
        return resp.imageURLs[0]
      })
    );

    if (!isError) {
      this.totalCalls++;
      this.totalDuration += (+new Date() - start) / 1000;
      jobs.set(jobId, { status: 'completed', result: { [fieldName]: images } });
      return { ok: true };
    } else {
      return { ok: false, error: 'Error during image generation' };
    }
  }

  private async regenerateCell(jobId, fieldToRegenerate, recordId, actionType, prompt) {
    if (!fieldToRegenerate || !recordId || !actionType ) {
      jobs.set(jobId, { status: 'failed', error: 'Missing parameters' });
      //return { ok: false, error: "Missing parameters" };
    }
    if ( !prompt ) {
      if (actionType === 'analyze') {
        prompt = this.options.fillFieldsFromImages ? (this.options.fillFieldsFromImages as any)[fieldToRegenerate] : null;
      } else if (actionType === 'analyze_no_images') {
        prompt = this.options.fillPlainFields ? (this.options.fillPlainFields as any)[fieldToRegenerate] : null;
      }
    }
    const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
    const record = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, recordId)] );

    let promptToPass = JSON.stringify({[fieldToRegenerate]: prompt});
    if (STUB_MODE) {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 20000) + 1000));
      // return { ok: true, result: {[fieldToRegenerate]: "stub value"} };
      jobs.set(jobId, { status: 'completed', result: {[fieldToRegenerate]: "stub value"} });
    } else {
      if ( actionType === 'analyze') {
        const compiledPropmt = await this.compileOutputFieldsTemplates(record, promptToPass);
        const finalPrompt = this.getPromptForImageAnalysis(compiledPropmt);
        const attachmentFiles = await this.options.attachFiles({ record: record });
        if (attachmentFiles.length === 0) {
          // return { ok: false, error: "No source images found" };
          jobs.set(jobId, { status: 'failed', error: "No source images found" });
        }
        let visionAdapterResponse;
        try {
          visionAdapterResponse = await this.options.visionAdapter.generate({ prompt: finalPrompt, inputFileUrls: attachmentFiles });
        } catch (e) {
          // return { ok: false, error: 'AI provider refused to analyze images' };
          jobs.set(jobId, { status: 'failed', error: 'AI provider refused to analyze images' });
        }
        const resp: any = (visionAdapterResponse as any).response;
        const topLevelError = (visionAdapterResponse as any).error;
        if (topLevelError || resp?.error) {
          // return { ok: false, error: `ERROR: ${JSON.stringify(topLevelError.message || resp?.error.message)}` };
          jobs.set(jobId, { status: 'failed', error: `ERROR: ${JSON.stringify(topLevelError.message || resp?.error.message)}` });
        }

        const textOutput = resp?.output?.[0]?.content?.[0]?.text ?? resp?.output_text ?? resp?.choices?.[0]?.message?.content;
        if (!textOutput || typeof textOutput !== 'string') {
          // return { ok: false, error: 'AI response is not valid text' };
          jobs.set(jobId, { status: 'failed', error: 'AI response is not valid text' });
        }

        let resData;
        try {
          resData = JSON.parse(textOutput);
        } catch (e) {
          jobs.set(jobId, { status: 'failed', error: 'AI response is not valid JSON. Probably attached invalid image URL', aiResponse: textOutput });
        }
        // return { ok: true, result: resData };
        jobs.set(jobId, { status: 'completed', result: resData });

      } else if ( actionType === 'analyze_no_images') {
        const compiledPropmt = await this.compileOutputFieldsTemplatesNoImage(record, promptToPass);
        const finalPrompt = this.getPromptForPlainFields(compiledPropmt);
        const numberOfTokens = this.options.fillPlainFieldsMaxTokens ? this.options.fillPlainFieldsMaxTokens : 1000;
        let resp;
        try {
          const { content: chatResponse, error: topLevelError } = await this.options.textCompleteAdapter.complete(finalPrompt, [], numberOfTokens);
          if (topLevelError) {
            // return { ok: false, error: `ERROR: ${JSON.stringify(topLevelError)}` };
            jobs.set(jobId, { status: 'failed', error: `ERROR: ${JSON.stringify(topLevelError)}` });
          }
          resp = chatResponse;
        } catch (e) {
          // return { ok: false, error: 'AI provider refused to analyze plain fields' };
          jobs.set(jobId, { status: 'failed', error: 'AI provider refused to analyze plain fields' });
        }
        let resData;
        try {
          resData = JSON.parse(resp);
        } catch (e) {
          jobs.set(jobId, { status: 'failed', error: 'AI response is not valid JSON', aiResponse: resp });
        }
        // return { ok: true, result: resData };
        jobs.set(jobId, { status: 'completed', result: resData });
      }
    }
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    //check if options names are provided
    const columns = this.resourceConfig.columns;
    let columnEnums = [];
    if (this.options.fillFieldsFromImages) {
      for (const [key, value] of Object.entries((this.options.fillFieldsFromImages ))) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (column && column.enum) {
          (this.options.fillFieldsFromImages as any)[key] = `${value} Select ${key} from the list (USE ONLY VALUE FIELD. USE ONLY VALUES FROM THIS LIST): ${JSON.stringify(column.enum)}`;
          columnEnums.push({
            name: key,
            enum: column.enum,
          });
        }
      }
    }

    if (this.options.fillPlainFields) {
      for (const [key, value] of Object.entries((this.options.fillPlainFields))) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (column && column.enum) {
          (this.options.fillPlainFields as any)[key] = `${value} Select ${key} from the list (USE ONLY VALUE FIELD. USE ONLY VALUES FROM THIS LIST): ${JSON.stringify(column.enum)}`;
          columnEnums.push({
            name: key,
            enum: column.enum,
          });
        }
      }
    }  

    const outputImageFields = [];
    if (this.options.generateImages) {
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        outputImageFields.push(key);
      }
    }
    const outputPlainFields = [];
    if (this.options.fillPlainFields) {
      for (const [key, value] of Object.entries(this.options.fillPlainFields)) {
        outputPlainFields.push(key);
      }
    }
    const outputFieldsForAnalizeFromImages = [];
    if (this.options.fillFieldsFromImages) {
      for (const [key, value] of Object.entries(this.options.fillFieldsFromImages)) {
        outputFieldsForAnalizeFromImages.push(key);
      }
    }

    const outputImagesPluginInstanceIds = {};
    //check if Upload plugin is installed on all attachment fields
    if (this.options.generateImages) {
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        const plugin = adminforth.activatedPlugins.find(p => 
          p.resourceConfig!.resourceId === this.resourceConfig.resourceId &&
          p.pluginOptions.pathColumnName === key
        );
        if (!plugin) {
          throw new Error(`Plugin for attachment field '${key}' not found in resource '${this.resourceConfig.resourceId}', please check if Upload Plugin is installed on the field ${key}`);
        }
        if (!plugin.pluginOptions.storageAdapter.objectCanBeAccesedPublicly()) {
          throw new Error(`Upload Plugin for attachment field '${key}' in resource '${this.resourceConfig.resourceId}' 
            uses adapter which is not configured to store objects in public way, so it will produce only signed private URLs which can not be used in HTML text of blog posts.
            Please configure adapter in such way that it will store objects publicly (e.g.  for S3 use 'public-read' ACL).  
          `);
        }
          outputImagesPluginInstanceIds[key] = plugin.pluginInstanceId;
      }
    }

    const outputFields = {
      ...this.options.fillFieldsFromImages,
      ...this.options.fillPlainFields,
      ...(this.options.generateImages || {})
    };

    const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
    // Map of column technical names to their display labels from resource config
    const columnLabels: Record<string, string> = Object.fromEntries(
      (this.resourceConfig.columns || []).map((c: any) => [c.name, c.label || c.name])
    );
    
    const pageInjection = {
      file: this.componentPath('VisionAction.vue'),
      meta: {
        pluginInstanceId: this.pluginInstanceId,
        outputFields: outputFields,
        actionName: this.options.actionName,
        columnEnums: columnEnums,
        columnLabels: columnLabels,
        outputImageFields: outputImageFields,
        outputFieldsForAnalizeFromImages: outputFieldsForAnalizeFromImages,
        outputPlainFields: outputPlainFields,
        primaryKey: primaryKeyColumn.name,
        outputImagesPluginInstanceIds: outputImagesPluginInstanceIds,
        isFieldsForAnalizeFromImages: this.options.fillFieldsFromImages ? Object.keys(this.options.fillFieldsFromImages).length > 0 : false,
        isFieldsForAnalizePlain: this.options.fillPlainFields ? Object.keys(this.options.fillPlainFields).length > 0 : false,
        isImageGeneration: this.options.generateImages ? Object.keys(this.options.generateImages).length > 0 : false,
        isAttachFiles: this.options.attachFiles ? true : false,
        disabledWhenNoCheckboxes: true,
        refreshRates: {
          fillFieldsFromImages: this.options.refreshRates?.fillFieldsFromImages || 2_000,
          fillPlainFields: this.options.refreshRates?.fillPlainFields || 1_000,
          generateImages: this.options.refreshRates?.generateImages || 5_000,
          regenerateImages: this.options.refreshRates?.regenerateImages || 5_000,
        },
        askConfirmationBeforeGenerating: this.options.askConfirmationBeforeGenerating || false,
        generationPrompts: {
          plainFieldsPrompts: this.options.fillPlainFields || {},
          imageFieldsPrompts: this.options.fillFieldsFromImages || {},
          imageGenerationPrompts: this.options.generateImages || {},
        }
      }
    }
    
    if (!resourceConfig.options.pageInjections) {
      resourceConfig.options.pageInjections = {};
    }
    if (!resourceConfig.options.pageInjections.list) {
      resourceConfig.options.pageInjections.list = {};
    }
    if (!resourceConfig.options.pageInjections.list.threeDotsDropdownItems) {
      resourceConfig.options.pageInjections.list.threeDotsDropdownItems = [];
    }

    (resourceConfig.options.pageInjections.list.threeDotsDropdownItems as AdminForthComponentDeclaration[]).push(pageInjection);
  }
  
  validateConfigAfterDiscover(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    const columns = this.resourceConfig.columns;
    if (this.options.fillFieldsFromImages) {
      if (!this.options.attachFiles) {
        throw new Error('⚠️ attachFiles function must be provided when fillFieldsFromImages is used');
      }
      if (!this.options.visionAdapter) {
        throw new Error('⚠️ visionAdapter must be provided when fillFieldsFromImages is used');
      }
      for (const key of Object.keys(this.options.fillFieldsFromImages)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (!column) {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
      }
    }
    if (this.options.fillPlainFields) {
      if (!this.options.textCompleteAdapter) {
        throw new Error('⚠️ textCompleteAdapter must be provided when fillPlainFields is used');
      }
      for (const key of Object.keys(this.options.fillPlainFields)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (!column) {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
      }
    }
    if (this.options.generateImages) {
      for (const key of Object.keys(this.options.generateImages)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (!column) {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
        const perKeyAdapter = this.options.generateImages[key].adapter;
        if (!perKeyAdapter && !this.options.imageGenerationAdapter) {
          throw new Error(`⚠️ No image generation adapter provided for key "${key}"`);
        }

        const plugin = adminforth.activatedPlugins.find(p => 
          p.resourceConfig!.resourceId === this.resourceConfig.resourceId &&
          p.pluginOptions.pathColumnName === key
        );
        if (!plugin) {
          throw new Error(`Plugin for attachment field '${key}' not found in resource '${this.resourceConfig.resourceId}', please check if Upload Plugin is installed on the field ${key}`);
        }
        if (!plugin.pluginOptions || !plugin.pluginOptions.storageAdapter) {
          throw new Error(`Upload Plugin for attachment field '${key}' in resource '${this.resourceConfig.resourceId}' is missing a storageAdapter configuration.`);
        }
        if (typeof plugin.pluginOptions.storageAdapter.objectCanBeAccesedPublicly !== 'function') {
          throw new Error(`Upload Plugin for attachment field '${key}' in resource '${this.resourceConfig.resourceId}' uses a storage adapter without 'objectCanBeAccesedPublicly' method.`);
        }
        if (!plugin.pluginOptions.storageAdapter.objectCanBeAccesedPublicly()) {
          throw new Error(`Upload Plugin for attachment field '${key}' in resource '${this.resourceConfig.resourceId}' 
            uses adapter which is not configured to store objects in public way, so it will produce only signed private URLs which can not be used in HTML text of blog posts.
            Please configure adapter in such way that it will store objects publicly (e.g.  for S3 use 'public-read' ACL).  
          `);
        }
      }
    }
    if ((this.options.fillFieldsFromImages || this.options.fillPlainFields || this.options.generateImages) && !this.options.provideAdditionalContextForRecord) {
      let matches: string[] = [];
      const regex = /{{(.*?)}}/g;

      if (this.options.fillFieldsFromImages) {
        for (const [key, value] of Object.entries((this.options.fillFieldsFromImages ))) {
          const template = value;
          const templateMatches = template.match(regex);
          if (templateMatches) {
            matches.push(...templateMatches);
          }
        }
      }
      if (this.options.fillPlainFields) {
        for (const [key, value] of Object.entries((this.options.fillPlainFields))) {
          const template = value;
          const templateMatches = template.match(regex);
          if (templateMatches) {
            matches.push(...templateMatches);
          }
        }
      }
      if (this.options.generateImages) {
        for (const [key, value] of Object.entries((this.options.generateImages ))) {
          const template = value.prompt;
          const templateMatches = template.match(regex);
          if (templateMatches) {
            matches.push(...templateMatches);
          }
        }
      }

      if (matches) {
        matches.forEach((match) => {
          const field = match.replace(/{{|}}/g, '').trim();
          if (!resourceConfig.columns.find((column: any) => column.name === field)) {
            const similar = suggestIfTypo(resourceConfig.columns.map((column: any) => column.name), field);
            throw new Error(`Field "${field}" specified in generationPrompt not found in resource "${resourceConfig.label}". ${similar ? `Did you mean "${similar}"?` : ''}`);
          } else {
            let column = resourceConfig.columns.find((column: any) => column.name === field);
            if (column.backendOnly === true) {
              throw new Error(`Field "${field}" specified in generationPrompt is marked as backendOnly in resource "${resourceConfig.label}". Please remove backendOnly or choose another field.`);
            }
          }
        });
      }
    }
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    return `${this.pluginOptions.actionName}`;
  }

  setupEndpoints(server: IHttpServer) {
    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_records`,
      handler: async ( body ) => {
        let records = [];
        const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
        records = await this.adminforth.resource(this.resourceConfig.resourceId).list([Filters.IN(primaryKeyColumn.name, body.body.record)]);
        for( const [index, record] of records.entries() ) {
          records[index]._label = this.resourceConfig.recordLabel(records[index]);
        }
        const order = Object.fromEntries(body.body.record.map((id, i) => [id, i]));

        const sortedRecords = records.sort(
          (a, b) => order[a.id] - order[b.id]
        );
        return {
          records: sortedRecords,
        };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_images`,
      handler: async ( body ) => {
        let images = [];
        if(body.body.record){
          for( const record of body.body.record ) {
            if (this.options.attachFiles) {
              images.push(await this.options.attachFiles({ record: record }));
            }
          }
        }
        return {
          images,
        };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/update_fields`,
      handler: async ({ body, adminUser, headers }) => {
        let isAllowedToSave: any = { ok: true, error: '' };
        if(this.options.isAllowedToSave) {
          isAllowedToSave = await this.options.isAllowedToSave({ record: {}, adminUser: adminUser, resource: this.resourceConfig });
        }
        if (isAllowedToSave.ok !== false) {
          const selectedIds = body.selectedIds || [];
          const fieldsToUpdate = body.fields || {};
          const saveImages = body.saveImages;
          const outputImageFields = [];
          if (this.options.generateImages) {
            for (const [key, value] of Object.entries(this.options.generateImages)) {
              outputImageFields.push(key);
            }
          }
          const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
          const updates = selectedIds.map(async (ID, idx) => {
            const oldRecord = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, ID)] );
            for (const [key, value] of Object.entries(outputImageFields)) {
              const columnPlugin = this.adminforth.activatedPlugins.find(p => 
                p.resourceConfig!.resourceId === this.resourceConfig.resourceId &&
                p.pluginOptions.pathColumnName === value
              );
              if (columnPlugin && saveImages) {
                if(columnPlugin.pluginOptions.storageAdapter.objectCanBeAccesedPublicly()) {
                  if (oldRecord[value]) {
                    // put tag to delete old file
                    try {
                      if (columnPlugin.pluginOptions.storageAdapter.markKeyForDeletion !== undefined) {
                        await columnPlugin.pluginOptions.storageAdapter.markKeyForDeletion(oldRecord[value]);
                      } else {
                        await columnPlugin.pluginOptions.storageAdapter.markKeyForDeletation(oldRecord[value]);
                      }
                    } catch (e) {
                      // file might be e.g. already deleted, so we catch error
                      console.error(`Error setting tag to true for object ${oldRecord[value]}. File will not be auto-cleaned up`);
                    }
                  }
                  if (fieldsToUpdate[idx][value] && fieldsToUpdate[idx][value] !== null) {
                  // remove tag from new file
                  // in this case we let it crash if it fails: this is a new file which just was uploaded. 
                    if (columnPlugin.pluginOptions.storageAdapter.markKeyForNotDeletion !== undefined) {
                      await  columnPlugin.pluginOptions.storageAdapter.markKeyForNotDeletion(fieldsToUpdate[idx][value]);
                    } else {
                      await  columnPlugin.pluginOptions.storageAdapter.markKeyForNotDeletation(fieldsToUpdate[idx][value]);
                    }
                  }
                }
              }
            }
            const newRecord = {
              ...oldRecord,
              ...fieldsToUpdate[idx]
            };
            return this.adminforth.updateResourceRecord({
              resource: this.resourceConfig,
              recordId: ID,
              oldRecord: oldRecord,
              record: newRecord,
              adminUser: adminUser,
            })
          });
          await Promise.all(updates);
          return { ok: true };
        } else {
          return { ok: false, error: isAllowedToSave.error };
        }
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_image_generation_prompts`,
      handler: async ({ body, headers }) => {
        const Id = body.recordId || [];
        const customPrompt = body.customPrompt || null;
        const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(this.resourceConfig.columns.find(c => c.primaryKey)?.name, Id)]);
        const compiledGenerationOptions = await this.compileGenerationFieldTemplates(record, JSON.stringify({"prompt": customPrompt}));
        return compiledGenerationOptions;
      }
    });


    server.endpoint({
      method: 'GET',
      path: `/plugin/${this.pluginInstanceId}/averageDuration`,
      handler: async () => {
        return {
          totalCalls: this.totalCalls,
          totalDuration: this.totalDuration,
          averageDuration: this.totalCalls ? this.totalDuration / this.totalCalls : null,
        };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/create-job`,
      handler: async ({ body, adminUser, headers }) => {
        const { actionType, recordId, customPrompt, filterFilledFields } = body;
        const jobId = randomUUID();
        jobs.set(jobId, { status: "in_progress" });
        if (!actionType) {
          jobs.set(jobId, { status: "failed", error: "Missing action type" });
          //return { error: "Missing action type" };
        }
        else if (!recordId) {
          jobs.set(jobId, { status: "failed", error: "Missing record id" });
          //return { error: "Missing record id" };
        } else {
          switch(actionType) {
            case 'generate_images':
              this.initialImageGenerate(jobId, recordId, adminUser, headers, customPrompt, filterFilledFields);
            break;
            case 'analyze_no_images':
              this.analyzeNoImages(jobId, recordId, adminUser, headers, customPrompt, filterFilledFields);
            break;
            case 'analyze':
              this.analyze_image(jobId, recordId, adminUser, headers, customPrompt, filterFilledFields);
            break;
            case 'regenerate_images':
              if (!body.prompt || !body.fieldName) {
                jobs.set(jobId, { status: "failed", error: "Missing prompt or field name" });
                break;
              }
              this.regenerateImage(jobId, recordId, body.fieldName, body.prompt, adminUser, headers);
            break;
            case 'regenerate_cell':
              const fieldToRegenerate = body.fieldToRegenerate;
              this.regenerateCell(jobId, fieldToRegenerate, recordId, body.action, body.prompt);
            break;
            default:
              jobs.set(jobId, { status: "failed", error: "Unknown action type" });
          } 
        }
        setTimeout(() => jobs.delete(jobId), 1_800_000);
        setTimeout(() => jobs.set(jobId, { status: "failed", error: "Job timed out" }), 180_000);
        return { ok: true, jobId };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get-job-status`,
      handler: async ({ body, adminUser, headers }) => {
        const jobId = body.jobId;
        if (!jobId) {
          return { error: "Can't find job id" };
        }
        const job = jobs.get(jobId);
        if (!job) {
          return { error: "Job not found" };
        }
        return { ok: true, job };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/update-rate-limits`,
      handler: async ({ body, adminUser, headers }) => {
        const actionType = body.actionType;
        if (actionType === 'analyze' && this.options.rateLimits?.fillFieldsFromImages) {
          if (await this.checkRateLimit("fillFieldsFromImages" ,this.options.rateLimits.fillFieldsFromImages, headers)) {
            return {ok: false, error: "Rate limit exceeded for image analyze" };
          }
        }
        if (actionType === 'analyze_no_images' && this.options.rateLimits?.fillPlainFields) {
          if (await this.checkRateLimit("fillPlainFields" ,this.options.rateLimits.fillPlainFields, headers)) {
            return {ok: false, error: "Rate limit exceeded for plain field analyze" };
          }
        }
        if (actionType === 'generate_images' && this.options.rateLimits?.generateImages) {
          if (await this.checkRateLimit("generateImages" ,this.options.rateLimits.generateImages, headers)) {
            return {ok: false, error: "Rate limit exceeded for image generation" };
          }
        }

        return { ok: true };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/compile_old_image_link`,
      handler: async ({ body, adminUser, headers }) => {
        const image = body.image;
        const columnName = body.columnName;
        if (!image) {
          return { ok: false, error: "Can't find image url" };
        }
        if (!columnName) {
          return { ok: false, error: "Can't find column name" };
        }
        try {
          if (this.options?.generateImages) {
            const plugin = this.adminforth.activatedPlugins.find(p =>
              p.resourceConfig!.resourceId === this.resourceConfig.resourceId &&
              p.pluginOptions.pathColumnName === columnName
            );
            if (plugin?.pluginOptions?.preview) {
              const compiledPreviewUrl = plugin.pluginOptions.preview.previewUrl({ filePath: image });
              return { ok: true, previewUrl: compiledPreviewUrl };
            }
            return { ok: false, error: "Can't find plugin for column" };
          }
        } catch (e) {
          return { ok: false, error: "Error compiling preview url" };
        }
      }
    });
  }
}