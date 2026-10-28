import fs from 'fs';
import path from 'path';

function copyDirSync(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const backupDir = path.join(process.cwd(), 'backup_v1');

// Ensure backup directory is fresh/cleaned
if (fs.existsSync(backupDir)) {
  fs.rmSync(backupDir, { recursive: true, force: true });
}
fs.mkdirSync(backupDir, { recursive: true });

// Copy directories
const dirsToBackup = ['src', 'public'];
for (const dir of dirsToBackup) {
  const srcPath = path.join(process.cwd(), dir);
  if (fs.existsSync(srcPath)) {
    console.log(`Copying directory: ${dir}`);
    copyDirSync(srcPath, path.join(backupDir, dir));
  }
}

// Copy top level files
const filesToBackup = [
  'package.json',
  'server.ts',
  'vite.config.ts',
  'tsconfig.json',
  'index.html',
  'firestore.rules',
  'firebase-blueprint.json',
  'firebase-applet-config.json',
  '.env.example',
  'metadata.json'
];

for (const file of filesToBackup) {
  const srcPath = path.join(process.cwd(), file);
  if (fs.existsSync(srcPath)) {
    console.log(`Copying file: ${file}`);
    fs.copyFileSync(srcPath, path.join(backupDir, file));
  }
}

console.log('Backup created successfully inside /backup_v1!');
