import AdminForth, { ImageVisionAdapter, ImageGenerationAdapter, CompletionAdapter } from "adminforth";

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
     * Job refresh rate for each ai flow job in milliseconds
     */
    refreshRates?: {
      fillFieldsFromImages?: number,
      fillPlainFields?: number,
      generateImages?: number,
      regenerateImages?: number,
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

    /**
     * Custom message for the context shown to the user when performing the action
     */
    provideAdditionalContextForRecord?: ({record, adminUser, resource}: {
      record: any;
      adminUser: any;
      resource: any;
    }) => Record<string, any> | Promise<Record<string, any>>;

    askConfirmationBeforeGenerating?: boolean;

  /**
   * Maximum number of records processed concurrently on the frontend.
   */
  concurrencyLimit?: number;

  /**
   * Defines the way how records are selected for the action. 
   * 
   * 'checkbox' means that user will select records manually by checkboxes, 
   * 
   * 'filtered' means that action will be applied to all records matching current 
   *  filters without showing any checkboxes (use with caution). 
   * 
   * Default is 'checkbox'.
   */
  recordSelector?: 'checkbox' | 'filtered';

  /**
   * Additional confirmation settings for long-running generations.
   *
   * Generating a very large number of records can be expensive. This option
   * lets you pause the process at specific checkpoints so the user can review
   * everything generated so far and then choose to Resume or Stop the
   * generation.
   *
   * Each entry in the array defines a confirmation breakpoint:
   * - `{ afterRecords: N }` – show a confirmation once, after the first N
   *   records have been processed.
   * - `{ everyRecords: N }` – show a confirmation after every N records.
   */
  askConfirmation?: ({ afterRecords: number } | { everyRecords: number })[]

}
