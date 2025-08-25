import { ImageVisionAdapter, AdminUser, IAdminForth, StorageAdapter, ImageGenerationAdapter } from "adminforth";


export interface PluginOptions {
    actionName: string,
    visionAdapter: ImageVisionAdapter,
    fillFieldsFromImages?: Record<string, string>, // can analyze what is on image and fill fields, typical tasks "find dominant color", "describe what is on image", "clasify to one enum item, e.g. what is on image dog/cat/plant"
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,

    generateImages?: Record<
      string, {
        // can generate from images or just from another fields, e.g. "remove text from images", "improve image quality", "turn image into ghibli style"
      prompt: string,

      adapter: ImageGenerationAdapter,

      /**
       * The size of the generated image.
       */
      outputSize?: string,

      /**
       * Fields for conetext which will be used to generate the image.
       * If specified, the plugin will use fields from the record to provide additional context to the AI model.
       */
      fieldsForContext?: string[],
      
      /**
       * Since AI generation can be expensive, we can limit the number of requests per IP.
       * E.g. 5/1d - 5 requests per day
       * 3/1h - 3 requests per hour
       */
      rateLimit?: string,

      /**
       * The number of images to generate
       * in one request
       */
      countToGenerate: number,
    }>,
}
