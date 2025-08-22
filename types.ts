import { ImageVisionAdapter, AdminUser, IAdminForth, StorageAdapter } from "adminforth";


export interface PluginOptions {
    actionName: string,
    adapter: ImageVisionAdapter,
    outputFields: Record<string, string>[],
    attachFiles?: ({ record }: {
      record: any,
    }) => string[] | Promise<string[]>,
}
