import { AdminForthPlugin, Filters } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthComponentDeclaration, AdminForthResourceColumn, AdminForthDataTypes, AdminForthResource } from "adminforth";
import type { PluginOptions } from './types.js';
import { json } from "stream/consumers";
import Handlebars, { compile } from 'handlebars';
import { RateLimiter } from "adminforth";


export default class  BulkAiFlowPlugin extends AdminForthPlugin {
  options: PluginOptions;
  uploadPlugin: AdminForthPlugin;
  totalCalls: number;
  totalDuration: number;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;

    // for calculating average time
    this.totalCalls = 0;
    this.totalDuration = 0;
  }

  // Compile Handlebars templates in outputFields using record fields as context
  private compileTemplates<T extends Record<string, any>>(
    source: T,
    record: any,
    valueSelector: (value: T[keyof T]) => string
  ): Record<string, string> {
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

  private compileOutputFieldsTemplates(record: any) {
    return this.compileTemplates(this.options.fillFieldsFromImages, record, v => String(v));
  }

  private compileOutputFieldsTemplatesNoImage(record: any) {
    return this.compileTemplates(this.options.fillPlainFields, record, v => String(v));
  }

  private compileGenerationFieldTemplates(record: any) {
    return this.compileTemplates(this.options.generateImages, record, v => String(v.prompt));
  }

  private checkRateLimit(field: string,fieldNameRateLimit: string | undefined, headers: Record<string, string | string[] | undefined>): { error?: string } | void {
    if (fieldNameRateLimit) {
      // rate limit
      const { error } = RateLimiter.checkRateLimit(
        field,
        fieldNameRateLimit,
        this.adminforth.auth.getClientIp(headers),
      );
      if (error) {
        return { error: "Rate limit exceeded" };
      }
    }
  }


  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    //check if options names are provided
    const columns = this.resourceConfig.columns;
    let columnEnums = [];
    if (this.options.fillFieldsFromImages) {
      if (!this.options.attachFiles) {
        throw new Error('⚠️ attachFiles function must be provided in options when fillFieldsFromImages is used');
      }
      if (!this.options.visionAdapter) {
        throw new Error('⚠️ visionAdapter must be provided in options when fillFieldsFromImages is used');
      }

      for (const [key, value] of Object.entries((this.options.fillFieldsFromImages ))) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (column) {
          if(column.enum){
            (this.options.fillFieldsFromImages as any)[key] = `${value} Select ${key} from the list (USE ONLY VALUE FIELD. USE ONLY VALUES FROM THIS LIST): ${JSON.stringify(column.enum)}`;
            columnEnums.push({
              name: key,
              enum: column.enum,
            });
          }
        } else {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
      }
    }

    if (this.options.fillPlainFields) {
      if (!this.options.textCompleteAdapter) {
        throw new Error('⚠️ textCompleteAdapter must be provided in options when fillPlainFields is used');
      }

      for (const [key, value] of Object.entries((this.options.fillPlainFields))) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (column) {
          if(column.enum){
            (this.options.fillPlainFields as any)[key] = `${value} Select ${key} from the list (USE ONLY VALUE FIELD. USE ONLY VALUES FROM THIS LIST): ${JSON.stringify(column.enum)}`;
            columnEnums.push({
              name: key,
              enum: column.enum,
            });
          }
        } else {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
      }
    }

    if (this.options.generateImages && !this.options.imageGenerationAdapter) {
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        if (!this.options.generateImages[key].adapter) {
          throw new Error(`⚠️ No image generation adapter found for key "${key}"`);
        }
      }
    }
  

    const outputImageFields = [];
    if (this.options.generateImages) {
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        outputImageFields.push(key);
      }
    }
    const outputImagesPluginInstanceIds = {};
    //check if Upload plugin is installed on all attachment fields
    if (this.options.generateImages) {
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (!column) {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
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

    const pageInjection = {
      file: this.componentPath('visionAction.vue'),
      meta: {
        pluginInstanceId: this.pluginInstanceId,
        outputFields: outputFields,
        actionName: this.options.actionName,
        columnEnums: columnEnums,
        outputImageFields: outputImageFields,
        outputPlainFields: this.options.fillPlainFields,
        primaryKey: primaryKeyColumn.name,
        outputImagesPluginInstanceIds: outputImagesPluginInstanceIds,
        isFieldsForAnalizeFromImages: this.options.fillFieldsFromImages ? Object.keys(this.options.fillFieldsFromImages).length > 0 : false,
        isFieldsForAnalizePlain: this.options.fillPlainFields ? Object.keys(this.options.fillPlainFields).length > 0 : false,
        isImageGeneration: this.options.generateImages ? Object.keys(this.options.generateImages).length > 0 : false
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
    // optional method where you can safely check field types after database discovery was performed
  }

  instanceUniqueRepresentation(pluginOptions: any) : string {
    // optional method to return unique string representation of plugin instance. 
    // Needed if plugin can have multiple instances on one resource 
    return `single`;
  }

  setupEndpoints(server: IHttpServer) {


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/analyze`,
      handler: async ({ body, adminUser, headers }) => {
      const selectedIds = body.selectedIds || [];
      if (typeof(this.options.rateLimits?.fillFieldsFromImages) === 'string'){
        if (this.checkRateLimit("fillFieldsFromImages" ,this.options.rateLimits.fillFieldsFromImages, headers)) {
          return { error: "Rate limit exceeded" };
        }
      }
      const tasks = selectedIds.map(async (ID) => {
        // Fetch the record using the provided ID
        const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
        const record = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, ID)] );

        //recieve image URLs to analyze
        const attachmentFiles = await this.options.attachFiles({ record: record });
        if (attachmentFiles.length !== 0) {
          //create prompt for OpenAI
          const compiledOutputFields = this.compileOutputFieldsTemplates(record);
          const prompt = `Analyze the following image(s) and return a single JSON in format like: {'param1': 'value1', 'param2': 'value2'}. 
            Do NOT return array of objects. Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
            Each object must contain the following fields: ${JSON.stringify(compiledOutputFields)} Use the exact field names. If it's number field - return only number.
            Image URLs:`;
            
          //send prompt to OpenAI and get response
          const chatResponse = await this.options.visionAdapter.generate({ prompt, inputFileUrls: attachmentFiles });

          const resp: any = (chatResponse as any).response;
          const topLevelError = (chatResponse as any).error;
          if (topLevelError || resp?.error) {
            throw new Error(`ERROR: ${JSON.stringify(topLevelError || resp?.error)}`);
          }

          const textOutput = resp?.output?.[0]?.content?.[0]?.text ?? resp?.output_text ?? resp?.choices?.[0]?.message?.content;
          if (!textOutput || typeof textOutput !== 'string') {
            throw new Error('Unexpected AI response format');
          }

          //parse response and update record
          const resData = JSON.parse(textOutput);

          return resData;
        };
      });

      const result = await Promise.all(tasks);

      return { result };
      }
    });

    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/analyze_no_images`,
      handler: async ({ body, adminUser, headers }) => {
      const selectedIds = body.selectedIds || [];
      if (typeof(this.options.rateLimits?.fillPlainFields) === 'string'){
        if (this.checkRateLimit("fillPlainFields", this.options.rateLimits.fillPlainFields, headers)) {
          return { error: "Rate limit exceeded" };
        }
      }
      const tasks = selectedIds.map(async (ID) => {
        // Fetch the record using the provided ID
        const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
        const record = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, ID)] );

        //create prompt for OpenAI
        const compiledOutputFields = this.compileOutputFieldsTemplatesNoImage(record);
        const prompt = `Analyze the following fields and return a single JSON in format like: {'param1': 'value1', 'param2': 'value2'}. 
          Do NOT return array of objects. Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
          Each object must contain the following fields: ${JSON.stringify(compiledOutputFields)} Use the exact field names. 
          If it's number field - return only number.`;
        //send prompt to OpenAI and get response
        const { content: chatResponse } = await this.options.textCompleteAdapter.complete(prompt, [], 500);

        const resp: any = (chatResponse as any).response;
        const topLevelError = (chatResponse as any).error;
        if (topLevelError || resp?.error) {
          throw new Error(`ERROR: ${JSON.stringify(topLevelError || resp?.error)}`);
        }

        //parse response and update record
        const resData = JSON.parse(chatResponse);

        return resData;
      });

      const result = await Promise.all(tasks);

      return { result };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_records`,
      handler: async ( body ) => {
        let records = [];
        const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
        for( const record of body.body.record ) {
          records.push(await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, record)] ));
          records[records.length - 1]._label = this.resourceConfig.recordLabel(records[records.length - 1]);
        }
        return {
          records,
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
                      await columnPlugin.pluginOptions.storageAdapter.markKeyForDeletation(oldRecord[value]);
                    } catch (e) {
                      // file might be e.g. already deleted, so we catch error
                      console.error(`Error setting tag to true for object ${oldRecord[value]}. File will not be auto-cleaned up`, e);
                    }
                  }
                  if (fieldsToUpdate[idx][key] && fieldsToUpdate[idx][key] !== null) {
                  // remove tag from new file
                  // in this case we let it crash if it fails: this is a new file which just was uploaded. 
                    await  columnPlugin.pluginOptions.storageAdapter.markKeyForNotDeletation(fieldsToUpdate[idx][value]);
                  }
                }
              }
            }
            return this.adminforth.resource(this.resourceConfig.resourceId).update(ID, fieldsToUpdate[idx])
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
      path: `/plugin/${this.pluginInstanceId}/regenerate_images`,
      handler: async ({ body, headers }) => {
        const Id = body.recordId || [];
        const prompt = body.prompt || '';
        const fieldName = body.fieldName || '';
        if (this.checkRateLimit(fieldName, this.options.generateImages[fieldName].rateLimit, headers)) {
          return { error: "Rate limit exceeded" };
        }
        const start = +new Date();
        const STUB_MODE = false;
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
              return null;
            }
            if (STUB_MODE) {
              await new Promise((resolve) => setTimeout(resolve, 2000));
              return `https://picsum.photos/200/300?random=${Math.floor(Math.random() * 1000)}`;
            }

            let generationAdapter;
            if (this.options.generateImages[fieldName].adapter) {
              generationAdapter = this.options.generateImages[fieldName].adapter;
            } else {
              generationAdapter = this.options.imageGenerationAdapter;
            }
            const resp = await generationAdapter.generate(
              {
                prompt,
                inputFiles: attachmentFiles,
                n: 1,
                size: this.options.generateImages[fieldName].outputSize,
              }
            )
            return resp.imageURLs[0]
          })
        );
        this.totalCalls++;
        this.totalDuration += (+new Date() - start) / 1000;
        return { images };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/initial_image_generate`,
      handler: async ({ body, headers }) => {
        const selectedIds = body.selectedIds || [];
        const STUB_MODE = false;
        if (typeof(this.options.rateLimits?.generateImages) === 'string'){
          if (this.checkRateLimit("generateImages", this.options.rateLimits.generateImages, headers)) {
            return { error: "Rate limit exceeded" };
          }
        }
        const start = +new Date();
        const tasks = selectedIds.map(async (ID) => {
          const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(this.resourceConfig.columns.find(c => c.primaryKey)?.name, ID)]);
          let attachmentFiles
          if(!this.options.attachFiles){
            attachmentFiles = [];
          } else {
            attachmentFiles = await this.options.attachFiles({ record });
          }
          const fieldTasks = Object.keys(this.options?.generateImages || {}).map(async (key) => {
            const prompt = this.compileGenerationFieldTemplates(record)[key];
            let images;
              if (this.options.attachFiles && attachmentFiles.length === 0) {
                return { key, images: [] };
              } else {
                if (STUB_MODE) {
                  await new Promise((resolve) => setTimeout(resolve, 2000));
                  images = `https://picsum.photos/200/300?random=${Math.floor(Math.random() * 1000)}`;
                } else {
                  let generationAdapter;
                  if (this.options.generateImages[key].adapter) {
                    generationAdapter = this.options.generateImages[key].adapter;
                  } else {
                    generationAdapter = this.options.imageGenerationAdapter;
                  }
                  const resp = await generationAdapter.generate(
                    {
                      prompt,
                      inputFiles: attachmentFiles,
                      n: 1,
                      size: this.options.generateImages[key].outputSize,
                    }
                  )
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

          return recordResult;
        });
        const result = await Promise.all(tasks);
        
        this.totalCalls++;
        this.totalDuration += (+new Date() - start) / 1000;

        return { result };
      }
    });


    server.endpoint({
      method: 'POST',
      path: `/plugin/${this.pluginInstanceId}/get_generation_prompts`,
      handler: async ({ body, headers }) => {
        const Id = body.recordId || [];
        const record = await this.adminforth.resource(this.resourceConfig.resourceId).get([Filters.EQ(this.resourceConfig.columns.find(c => c.primaryKey)?.name, Id)]);
        const compiledGenerationOptions = this.compileGenerationFieldTemplates(record);
        return { generationOptions: compiledGenerationOptions };
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



  }
}