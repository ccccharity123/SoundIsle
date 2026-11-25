// Use the same operations on WebKit versions that predate Object.hasOwn and Array.at.
export function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function lastItem(items) {
  return items == null ? undefined : items[items.length - 1];
}
