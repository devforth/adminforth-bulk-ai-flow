import { ImageVisionAdapter, AdminUser, IAdminForth, StorageAdapter } from "adminforth";


export interface PluginOptions {
    actionName: string,
    visionAdapter: ImageVisionAdapter,
    fillFieldsFromImages: Record<string, string>,
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,
}
