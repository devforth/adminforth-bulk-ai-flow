import { AdminForthPlugin, Filters } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthResourcePages, AdminForthResourceColumn, AdminForthDataTypes, AdminForthResource } from "adminforth";
import type { PluginOptions } from './types.js';
import { json } from "stream/consumers";
import Handlebars from 'handlebars';


export default class  BulkAiFlowPlugin extends AdminForthPlugin {
  options: PluginOptions;
  uploadPlugin: AdminForthPlugin;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  // Compile Handlebars templates in outputFields using record fields as context
  private compileOutputFieldsTemplates(record: any): Record<string, string> {
    const compiled: Record<string, string> = {};
    for (const [key, templateStr] of Object.entries(this.options.fillFieldsFromImages)) {
      try {
        const tpl = Handlebars.compile(String(templateStr));
        compiled[key] = tpl(record);
      } catch {
        compiled[key] = String(templateStr);
      }
    }
    return compiled;
  }
 
  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    //check if options names are provided
    const columns = this.resourceConfig.columns;
    let columnEnums = [];
    for (const [key, value] of Object.entries(this.options.fillFieldsFromImages)) {
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


    if (this.options.generateImages) {
      console.log('Generate Images options:', this.options.generateImages);
      for (const [key, value] of Object.entries(this.options.generateImages)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (!column) {
          throw new Error(`⚠️ No column found for key "${key}"`);
        }
        const plugin = adminforth.activatedPlugins.find(p => 
          p.resourceConfig!.resourceId === key &&
          p.pluginOptions.pathColumnName === this.resourceConfig.resourceId
        );
        // if (!plugin) {
        //   throw new Error(`Plugin for attachment field '${key}' not found in resource '${this.options.attachments!.attachmentResource}', please check if Upload Plugin is installed on the field ${this.options.attachments!.attachmentFieldName}`);
        // }
      }
    }


    const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
    //console.log('Primary Key Column:', primaryKeyColumn);

    const pageInjection = {
      file: this.componentPath('visionAction.vue'),
      meta: {
        pluginInstanceId: this.pluginInstanceId,
        outputFields: this.options.fillFieldsFromImages,
        actionName: this.options.actionName,
        columnEnums: columnEnums,
        primaryKey: primaryKeyColumn.name,
      }
    }

    if (!this.resourceConfig.options.pageInjections) {
      this.resourceConfig.options.pageInjections = {};
    }
    if (!this.resourceConfig.options.pageInjections.list) {
      this.resourceConfig.options.pageInjections.list = {};
    }

    this.resourceConfig.options.pageInjections.list.threeDotsDropdownItems = [pageInjection];
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
      const tasks = selectedIds.map(async (ID) => {
        // Fetch the record using the provided ID
        const primaryKeyColumn = this.resourceConfig.columns.find((col) => col.primaryKey);
        const record = await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ(primaryKeyColumn.name, ID)] );

        //recieve image URLs to analyze
        const attachmentFiles = await this.options.attachFiles({ record: record });
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
            images.push(await this.options.attachFiles({ record: record }));
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
      handler: async ( body ) => {
        const selectedIds = body.body.selectedIds || [];
        const fieldsToUpdate = body.body.fields || {};
        const updates = selectedIds.map((ID, idx) =>
          this.adminforth
            .resource(this.resourceConfig.resourceId)
            .update(ID, fieldsToUpdate[idx])
        );

        await Promise.all(updates);

      return { ok: true };
      }
    });
  }
}


