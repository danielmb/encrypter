#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { prompt } from 'enquirer';

const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

class FileSelector {
  private currentPath: string;
  private items: string[];

  constructor(initialPath: string = process.cwd()) {
    this.currentPath = initialPath;
    this.items = [];
  }

  async run(): Promise<string> {
    while (true) {
      this.updateItems();
      const choice = await this.prompt();

      if (choice === '..') {
        this.currentPath = path.dirname(this.currentPath);
      } else if (choice === '[SELECT]') {
        return this.currentPath;
      } else {
        const selectedPath = path.join(this.currentPath, choice);
        if (fs.statSync(selectedPath).isDirectory()) {
          this.currentPath = selectedPath;
        } else {
          return selectedPath;
        }
      }
    }
  }

  private updateItems() {
    this.items = ['[SELECT]', '..', ...fs.readdirSync(this.currentPath)];
  }

  private async prompt(): Promise<string> {
    interface AutoCompletePrompt {
      type: 'autocomplete';
      name: string;
      message: string;
      choices: string[];
      suggest: (input: string, choices: string[]) => string[];
    }

    const response = await prompt<{ file: string }>({
      type: 'autocomplete',
      name: 'file',
      message: `Select a file (current path: ${this.currentPath})`,
      choices: this.items,
      suggest(input: string, choices: string[]) {
        return choices.filter((choice) =>
          choice.toLowerCase().includes(input.toLowerCase()),
        );
      },
    } as AutoCompletePrompt);

    return response.file;
  }
}

function encryptFile(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(inputFile);
    const writeStream = fs.createWriteStream(outputFile);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    writeStream.write(iv);
    readStream.pipe(cipher).pipe(writeStream);

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

function decryptFile(inputFile: string, outputFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(inputFile);
    const writeStream = fs.createWriteStream(outputFile);

    readStream.once('readable', () => {
      const chunk = readStream.read(16);
      if (!chunk || chunk.length !== 16) {
        reject(new Error('Invalid encrypted file'));
        return;
      }

      const decipher = crypto.createDecipheriv(algorithm, key, chunk);
      readStream.pipe(decipher).pipe(writeStream);
    });

    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}

async function main() {
  const fileSelector = new FileSelector();

  console.log('Select the file to encrypt:');
  const originalFile = await fileSelector.run();

  const encryptedFile = `${originalFile}.encrypted`;
  const decryptedFile = `${originalFile}.decrypted`;

  try {
    // Encrypt the file
    await encryptFile(originalFile, encryptedFile);
    console.log('File encrypted successfully');

    // Decrypt the file
    await decryptFile(encryptedFile, decryptedFile);
    console.log('File decrypted successfully');

    // Compare original and decrypted files
    const originalContent = fs.readFileSync(originalFile, 'utf8');
    const decryptedContent = fs.readFileSync(decryptedFile, 'utf8');

    if (originalContent === decryptedContent) {
      console.log('Decryption successful: Original and decrypted files match');
    } else {
      console.log(
        'Decryption failed: Original and decrypted files do not match',
      );
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();
