import { ImageVisionAdapter, AdminUser, IAdminForth, StorageAdapter } from "adminforth";


export interface PluginOptions {
    actionName: string,
    visionAdapter: ImageVisionAdapter,
    fillFieldsFromImages?: Record<string, string>, // can analyze what is on image and fill fields, typical tasks "find dominant color", "describe what is on image", "clasify to one enum item, e.g. what is on image dog/cat/plant"
    generateImages?: Record<string, string>, // can generate from images or just from another fields, e.g. "remove text from images", "improve image quality", "turn image into ghibli style"
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,
}
