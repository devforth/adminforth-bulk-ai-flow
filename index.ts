import { AdminForthPlugin, Filters } from "adminforth";
import type { IAdminForth, IHttpServer, AdminForthResourcePages, AdminForthResourceColumn, AdminForthDataTypes, AdminForthResource } from "adminforth";
import type { PluginOptions } from './types.js';
import { json } from "stream/consumers";


export default class  BulkVisionPlugin extends AdminForthPlugin {
  options: PluginOptions;

  constructor(options: PluginOptions) {
    super(options, import.meta.url);
    this.options = options;
  }

  async modifyResourceConfig(adminforth: IAdminForth, resourceConfig: AdminForthResource) {
    super.modifyResourceConfig(adminforth, resourceConfig);

    //check if options names are provided
    const columns = this.resourceConfig.columns;
    let columnEnums = [];
    for (const field of this.options.outputFields) {
      for (const [key, value] of Object.entries(field)) {
        const column = columns.find(c => c.name.toLowerCase() === key.toLowerCase());
        if (column) {
          if(column.enum){
            (field as any)[key] = `${value} Select ${key} from the list (USE ONLY VALUE FIELD. USE ONLY VALUES FROM THIS LIST): ${JSON.stringify(column.enum)}`;
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

    const field = {
        label: this.options.actionName,
        confirm: this.options.confirmMessage,
        action: async ({ selectedIds, adminUser }: any) => {
          const tasks = selectedIds.map(async (ID) => {
            // Fetch the record using the provided ID
            const record = await adminforth.resource(resourceConfig.resourceId).get( [Filters.EQ('id', ID)] );

            //recieve image URLs to analyze
            const attachmentFiles = await this.options.attachFiles({ record: record });
            console.log("Attachment files to analyze:", attachmentFiles);
            //create prompt for OpenAI
            const prompt = `Analyze the following image(s) and return a single JSON in format like: {'param1': 'value1', 'param2': 'value2'}. 
              Do NOT return array of objects. Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
              Each object must contain the following fields: ${JSON.stringify(this.options.outputFields)} Use the exact field names.
              Image URLs:`;

            //send prompt to OpenAI and get response
            const chatResponse = await this.options.adapter.generate({ prompt, inputFileUrls: attachmentFiles });

            //if error in response, throw error
            if (chatResponse.response.error) {
              throw new Error(`ERROR: ${JSON.stringify(chatResponse.response.error)}`);
            }

            //parse response and update record
            const resData = JSON.parse(chatResponse.response.output[0].content[0].text);
            console.log("Parsed response data:", resData);

            const updates = Object.entries(resData).map(([key, value]) =>
              adminforth.resource(this.resourceConfig.resourceId).update(ID, { [key]: value })
            );

            return Promise.all(updates);
          });

          await Promise.all(tasks);
          return { ok: true, successMessage: "Updated successfully" };
        },

        showInThreeDotsDropdown: true,
      };

    const pageInjection = {
      file: this.componentPath('visionAction.vue'),
      meta: {
        pluginInstanceId: this.pluginInstanceId,
        outputFields: this.options.outputFields,
        actionName: this.options.actionName,
        confirmMessage: this.options.confirmMessage,
        columnEnums: columnEnums,
      }
    }

    if (!this.resourceConfig.options.pageInjections) {
      this.resourceConfig.options.pageInjections = {};
    }
    if (!this.resourceConfig.options.pageInjections.list) {
      this.resourceConfig.options.pageInjections.list = {};
    }

    this.resourceConfig.options.bulkActions.push(field);
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
      method: 'GET',
      path: `/plugin/${this.pluginInstanceId}/analize`,
      handler: async ({ body, adminUser, headers, selectedIds }) => {
       const tasks = selectedIds.map(async (ID) => {
            // Fetch the record using the provided ID
            const record = await adminUser.resource(resourceConfig.resourceId).get( [Filters.EQ('id', ID)] );

            //recieve image URLs to analyze
            const attachmentFiles = await this.options.attachFiles({ record: record });
            console.log("Attachment files to analyze:", attachmentFiles);
            //create prompt for OpenAI
            const prompt = `Analyze the following image(s) and return a single JSON in format like: {'param1': 'value1', 'param2': 'value2'}. 
              Do NOT return array of objects. Do NOT include any Markdown, code blocks, explanations, or extra text. Only return valid JSON. 
              Each object must contain the following fields: ${JSON.stringify(this.options.outputFields)} Use the exact field names.
              Image URLs:`;

            //send prompt to OpenAI and get response
            const chatResponse = await this.options.adapter.generate({ prompt, inputFileUrls: attachmentFiles });

            //if error in response, throw error
            if (chatResponse.response.error) {
              throw new Error(`ERROR: ${JSON.stringify(chatResponse.response.error)}`);
            }

            //parse response and update record
            const resData = JSON.parse(chatResponse.response.output[0].content[0].text);
            console.log("Parsed response data:", resData);

            // const updates = Object.entries(resData).map(([key, value]) =>
            //   adminforth.resource(this.resourceConfig.resourceId).update(ID, { [key]: value })
            // );

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
        for( const record of body.body.record ) {
          records.push(await this.adminforth.resource(this.resourceConfig.resourceId).get( [Filters.EQ('id', record)] ));
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
        for( const record of body.body.record ) {
          images.push(await this.options.attachFiles({ record: record }));
        }
        return {
          images,
        };
      }
    });
  }
}


