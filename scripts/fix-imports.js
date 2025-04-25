import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

function fixImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Fix relative imports
  const fixedContent = content.replace(
    /from ['"]\.\.\/([^'"]+)['"]/g,
    (match, p1) => {
      // Don't add .mjs if it's already there
      if (p1.endsWith('.mjs')) return match;
      // Handle directory imports
      if (p1.includes('/')) {
        const parts = p1.split('/');
        const last = parts.pop();
        return `from '../${parts.join('/')}/${last}.mjs'`;
      }
      return `from '../${p1}.mjs'`;
    }
  ).replace(
    /from ['"]\.\/([^'"]+)['"]/g,
    (match, p1) => {
      // Don't add .mjs if it's already there
      if (p1.endsWith('.mjs')) return match;
      // Handle directory imports
      if (p1.includes('/')) {
        const parts = p1.split('/');
        const last = parts.pop();
        return `from './${parts.join('/')}/${last}.mjs'`;
      }
      return `from './${p1}.mjs'`;
    }
  );
  
  fs.writeFileSync(filePath, fixedContent);
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.mjs')) {
      console.log(`Processing ${fullPath}`);
      fixImports(fullPath);
    }
  }
}

processDirectory(distDir); 