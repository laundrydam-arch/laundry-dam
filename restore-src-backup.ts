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

if (!fs.existsSync(backupDir)) {
  console.error('❌ Error: Folder backup "backup_v1" tidak ditemukan! Anda belum membuat backup.');
  process.exit(1);
}

console.log('🔄 Memulai proses pengembalian (Restore) ke Versi 1...');

// 1. Clean current src and public directory to avoid stray files
if (fs.existsSync(path.join(process.cwd(), 'src'))) {
  fs.rmSync(path.join(process.cwd(), 'src'), { recursive: true, force: true });
}
if (fs.existsSync(path.join(process.cwd(), 'public'))) {
  fs.rmSync(path.join(process.cwd(), 'public'), { recursive: true, force: true });
}

// 2. Restore src and public from backup
if (fs.existsSync(path.join(backupDir, 'src'))) {
  console.log('📦 Memulihkan folder src...');
  copyDirSync(path.join(backupDir, 'src'), path.join(process.cwd(), 'src'));
}
if (fs.existsSync(path.join(backupDir, 'public'))) {
  console.log('📦 Memulihkan folder public...');
  copyDirSync(path.join(backupDir, 'public'), path.join(process.cwd(), 'public'));
}

// 3. Restore top-level files
const filesToRestore = [
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

for (const file of filesToRestore) {
  const srcPath = path.join(backupDir, file);
  const destPath = path.join(process.cwd(), file);
  if (fs.existsSync(srcPath)) {
    console.log(`📄 Memulihkan file: ${file}`);
    fs.copyFileSync(srcPath, destPath);
  }
}

console.log('✅ Pemulihan BERHASIL! Aplikasi Anda telah kembali ke versi murni sebelum penggabungan POS.');
