import {readFileSync} from 'node:fs';

// Normalize only the test's in-memory text. Never rewrite production files or
// change Buffer reads used for byte/BOM assertions.
export function readTestFile(...args) {
  const value=readFileSync(...args);
  return typeof value==='string' ? value.replace(/\r\n?/g,'\n') : value;
}
