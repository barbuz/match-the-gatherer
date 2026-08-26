/** Thin idb-keyval wrapper (spec §13): plain async get/set/del helpers. */
import { get, set, del } from 'idb-keyval';

export function dbGet(key, fallback = null) {
  return get(key)
    .then((v) => (v === undefined ? fallback : v))
    .catch(() => fallback);
}

export function dbSet(key, value) {
  return set(key, value).catch(() => {});
}

export function dbDel(key) {
  return del(key).catch(() => {});
}
