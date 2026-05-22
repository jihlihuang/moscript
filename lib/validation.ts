export const MAX_COLLECTION_TITLE_LEN = 200;
export const MAX_COLLECTION_TEXT_LEN = 500;
export const MAX_COLLECTION_ITEMS = 100;
export const MAX_AUTHOR_LEN = 100;
export const MAX_SCRIPT_TYPE_LEN = 50;
export const MAX_WORK_TITLE_LEN = 200;
export const MAX_SOURCE_LEN = 200;
export const MAX_LICENSE_LEN = 100;

export function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}
