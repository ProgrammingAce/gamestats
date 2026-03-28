import { readFileSync } from 'fs';
const content = readFileSync('C:/Program Files (x86)/Steam/config/libraryfolders.vdf', 'utf-8');

const result = {};
const lines = content.split('\n');
const stack = [{ obj: result }];

for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '{' || trimmed === '}') continue;

  const match = trimmed.match(/^"(.*)"\t+"([^"]*)"?$/);
  if (match) {
    const key = match[1];
    const value = match[2];
    const current = stack[stack.length - 1].obj;

    if (value) {
      current[key] = value.replace(/\\"/g, '"');
    } else {
      const currentStack = stack[stack.length - 1];
      const parentStack = stack[stack.length - 2];
      if (parentStack) {
        const parentKey = Object.keys(parentStack.obj).find(k => parentStack.obj[k] === currentStack.obj);
        if (parentKey) {
          delete parentStack.obj[parentKey];
          parentStack.obj[parentKey] = currentStack.obj;
        }
      }
    }
  } else if (trimmed.match(/^"(.*)"\s*$/)) {
    const key = trimmed.match(/^"(.*)"\s*$/)[1];
    stack[stack.length - 1].obj[key] = {};
    stack.push({ obj: stack[stack.length - 1].obj[key] });
  }
}

console.log(JSON.stringify(result, null, 2));
