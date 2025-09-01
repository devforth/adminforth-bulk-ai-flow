import { ImageVisionAdapter, AdminUser, IAdminForth, StorageAdapter, ImageGenerationAdapter, CompletionAdapter } from "adminforth";


export interface PluginOptions {
    actionName: string,
    visionAdapter?: ImageVisionAdapter,
    textCompleteAdapter?: CompletionAdapter,
    /**
     * The adapter to use for image generation. 
     */
    imageGenerationAdapter?: ImageGenerationAdapter,
    fillFieldsFromImages?: Record<string, string>, // can analyze what is on image and fill fields, typical tasks "find dominant color", "describe what is on image", "clasify to one enum item, e.g. what is on image dog/cat/plant"
    fillPlainFields?: Record<string, string>,
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,

    generateImages?: Record<
      string, {
        // can generate from images or just from another fields, e.g. "remove text from images", "improve image quality", "turn image into ghibli style"
      prompt: string,

      /*
       * Redefine the adapter for your specific generation task 
       */
      adapter?: ImageGenerationAdapter,

      /**
       * The size of the generated image.
       */
      outputSize?: string,

      /**
       * Since AI generation can be expensive, we can limit the number of requests per IP.
       * E.g. 5/1d - 5 requests per day
       * 3/1h - 3 requests per hour
       */
      rateLimit?: string,

      /**
       * The number of images to regenerate
       * in one request
       */
      countToGenerate: number,
    }>,
    /** 
     * As rateLimit on generateImages, but applied to bulk generations  
     **/
    bulkGenerationRateLimit?: string, 

    /**
     * Whether the user is allowed to save the generated images
     */
    isAllowedToSave?: ({ record, adminUser, resource }: {
      record: any;
      adminUser: any;
      resource: any;
    }) => Promise<{
      ok: boolean;
      error: string;
    } | {
      ok: boolean;
      error?: undefined;
    }>
}
