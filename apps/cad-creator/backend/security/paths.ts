import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Security: Path Containment & Artifact Sandbox Root
 *
 * Ensures all CAD operations, .blend files, renders, and exports
 * operate ONLY within designated, bounded storage directories.
 * Prevents arbitrary filesystem traversal.
 */

const DEFAULT_CAD_ROOT = path.resolve(process.cwd(), 'storage', 'cad');

export class CadPathSandbox {
  private static rootDir: string = process.env.CAD_STORAGE_ROOT
    ? path.resolve(process.cwd(), process.env.CAD_STORAGE_ROOT)
    : DEFAULT_CAD_ROOT;

  public static getRootDir(): string {
    return this.rootDir;
  }

  public static getArtifactsDir(): string {
    return path.join(this.rootDir, 'artifacts');
  }

  public static getRendersDir(): string {
    return path.join(this.rootDir, 'renders');
  }

  public static getTempDir(): string {
    return path.join(this.rootDir, 'temp');
  }

  public static ensureDirectoriesExist(): void {
    const dirs = [
      this.rootDir,
      this.getArtifactsDir(),
      this.getRendersDir(),
      this.getTempDir(),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.warn(`[CadPathSandbox] Could not create directory ${dir}:`, err);
        }
      }
    }
  }

  /**
   * Validates and resolves a safe relative or absolute artifact path.
   * Throws an error if path traverses outside the sandbox root.
   */
  public static resolveSafePath(userPath: string, subfolder: 'artifacts' | 'renders' | 'temp' = 'artifacts'): string {
    this.ensureDirectoriesExist();

    // Sanitize input
    const cleanPath = userPath.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
    let targetPath: string;

    if (path.isAbsolute(userPath)) {
      targetPath = path.normalize(userPath);
    } else {
      targetPath = path.normalize(path.join(this.rootDir, subfolder, cleanPath));
    }

    // Strict containment check: targetPath must start with rootDir
    if (!targetPath.startsWith(this.rootDir)) {
      throw new Error(`[SecurityException] Path traversal rejected: ${userPath} is outside storage root ${this.rootDir}`);
    }

    return targetPath;
  }

  /**
   * Generates a deterministic or unique safe output path
   */
  public static createOutputPath(filename: string, subfolder: 'artifacts' | 'renders' | 'temp' = 'artifacts'): string {
    this.ensureDirectoriesExist();
    const sanitizedName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    return path.join(this.rootDir, subfolder, sanitizedName);
  }

  /**
   * Calculates the SHA-256 hash of a file or buffer
   */
  public static calculateSha256(content: Buffer | string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Calculates the SHA-256 hash of a file on disk
   */
  public static calculateFileSha256(filePath: string): string {
    if (!fs.existsSync(filePath)) {
      return '0000000000000000000000000000000000000000000000000000000000000000';
    }
    const fileBuffer = fs.readFileSync(filePath);
    return this.calculateSha256(fileBuffer);
  }
}
