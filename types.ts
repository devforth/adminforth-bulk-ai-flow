import { ImageVisionAdapter, ImageGenerationAdapter, CompletionAdapter } from "adminforth";


export interface PluginOptions {
    /**
     * Name of the action in three dots menu.
     */
    actionName: string,

     /**
     * The adapter to use for scaning images and filling fields basing on the image content.
     */
    visionAdapter?: ImageVisionAdapter,
    
    /**
     * The adapter to use for text->text generation.
     */
    textCompleteAdapter?: CompletionAdapter,

    /**
     * The adapter to use for image generation. 
     */
    imageGenerationAdapter?: ImageGenerationAdapter,
    
    /**
     * List of fields that should be filled based on the image content analysis.
     */
    fillFieldsFromImages?: Record<string, string>, // can analyze what is on image and fill fields, typical tasks "find dominant color", "describe what is on image", "clasify to one enum item, e.g. what is on image dog/cat/plant"

    /**
     * List of fields that should be filled based on the text.
     */
    fillPlainFields?: Record<string, string>,

    /**
     * Number of tokens to generate (Only for text completion adapter). Default is 1000. 1 token ~= ¾ words
     */
    fillPlainFieldsMaxTokens?: number,

    /**
     * If you want to generate fields or images based on the image content attached images 
     */
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,

    /**
     * List of image fields, that should be filled.
     */
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
     * Rate limits for each action.
     */
    rateLimits?: {
      fillFieldsFromImages?: string, // e.g. 5/1d - 5 requests per day
      fillPlainFields?: string,
      generateImages?: string,
    },


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
