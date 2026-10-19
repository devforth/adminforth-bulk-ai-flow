export type RecordStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type GenerationAction = 'analyze' | 'analyze_no_images' | 'generate_images';
export type PromptCategory = 'imageFieldsPrompts' | 'plainFieldsPrompts' | 'generateImages';
export type FieldKind = 'fromImage' | 'text' | 'image';
export type FieldChange = 'new' | 'changed' | 'same';

export type RecordState = {
  id: string | number;
  status: RecordStatus;
  isChecked: boolean;
  label: string;
  data: Record<string, any>;
  oldData: Record<string, any>;
  // links to the stored images of the image fields, null for an empty field
  oldImagePreviews: Record<string, string | null>;
  // source images returned by attachFiles
  images: string[];
  aiStatus: {
    generatedImages: boolean;
    analyzedImages: boolean;
    analyzedNoImages: boolean;
  };
  imageGenerationErrorMessage: string;
  imageGenerationFailed: boolean;
  imageToTextErrorMessages: Record<string, string>;
  textToTextErrorMessages: Record<string, string>;
  regeneratingFieldsStatus: Record<string, boolean>;
  // image fields which kept their stored image, because values are not overwritten
  listOfImageNotGenerated: Record<string, { originalImage: string }>;
};

export const PROMPT_CATEGORY: Record<GenerationAction, PromptCategory> = {
  analyze: 'imageFieldsPrompts',
  analyze_no_images: 'plainFieldsPrompts',
  generate_images: 'generateImages',
};

export const CATEGORY_KIND: Record<PromptCategory, FieldKind> = {
  imageFieldsPrompts: 'fromImage',
  plainFieldsPrompts: 'text',
  generateImages: 'image',
};

export function fieldKind(meta: any, field: string): FieldKind {
  if (meta.outputImageFields.includes(field)) {
    return 'image';
  }
  return meta.outputFieldsForAnalizeFromImages.includes(field) ? 'fromImage' : 'text';
}

// keys of the plugin options may differ in case from the column names
export function fieldLabel(meta: any, field: string): string {
  const labels: Record<string, string> = meta.columnLabels;
  const key = Object.keys(labels).find((name) => name.toLowerCase() === field.toLowerCase());
  return key ? labels[key] : field;
}

export function isFieldGenerating(record: RecordState, meta: any, field: string): boolean {
  const kind = fieldKind(meta, field);
  if (kind === 'image') {
    return !record.aiStatus.generatedImages;
  }
  const isDone = kind === 'fromImage' ? record.aiStatus.analyzedImages : record.aiStatus.analyzedNoImages;
  return !isDone || record.regeneratingFieldsStatus[field] === true;
}

// images and single fields of a record regenerate in parallel, its status settles once all of them finished
export function isRegenerating(record: RecordState): boolean {
  return !record.aiStatus.generatedImages || Object.values(record.regeneratingFieldsStatus).some(Boolean);
}

export function isRecordBusy(record: RecordState): boolean {
  return record.status === 'pending' || record.status === 'processing' || isRegenerating(record);
}

export function fieldError(record: RecordState, meta: any, field: string): string {
  const kind = fieldKind(meta, field);
  if (kind === 'image') {
    return record.imageGenerationFailed ? record.imageGenerationErrorMessage : '';
  }
  return (kind === 'fromImage' ? record.imageToTextErrorMessages : record.textToTextErrorMessages)[field] ?? '';
}

export function recordError(record: RecordState): string {
  return [
    record.imageGenerationFailed ? record.imageGenerationErrorMessage : '',
    ...Object.values(record.imageToTextErrorMessages),
    ...Object.values(record.textToTextErrorMessages),
  ].find(Boolean) ?? '';
}

// the image a field will have after saving: the generated one, or the stored one while nothing new was made
export function generatedImageUrl(record: RecordState, meta: any, field: string): string | null {
  return fieldChange(record, meta, field) === 'same' ? record.oldImagePreviews[field] ?? null : record.data[field];
}

function isEmpty(value: any): boolean {
  return value === null || value === undefined || value === '';
}

function isSameValue(a: any, b: any): boolean {
  if (isEmpty(a) || isEmpty(b)) {
    return isEmpty(a) && isEmpty(b);
  }
  return typeof a === 'object' || typeof b === 'object'
    ? JSON.stringify(a) === JSON.stringify(b)
    : String(a) === String(b);
}

export function fieldChange(record: RecordState, meta: any, field: string): FieldChange {
  const isKeptImage = fieldKind(meta, field) === 'image' && field in record.listOfImageNotGenerated;
  if (isKeptImage || isSameValue(record.data[field], record.oldData[field])) {
    return 'same';
  }
  return isEmpty(record.oldData[field]) ? 'new' : 'changed';
}

export function changedFieldsCount(record: RecordState, meta: any): number {
  return meta.outputFields.filter((field: string) => fieldChange(record, meta, field) !== 'same').length;
}

export function isRecordChanged(record: RecordState, meta: any): boolean {
  return record.status !== 'pending' && changedFieldsCount(record, meta) > 0;
}
