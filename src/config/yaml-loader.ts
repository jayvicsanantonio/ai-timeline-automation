import { promises as fs } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { ZodType } from 'zod';
import {
  LlmFile,
  LlmFileSchema,
  PipelineFile,
  PipelineFileSchema,
  SourcesFile,
  SourcesFileSchema,
} from './yaml-types';
import { ConfigurationError } from '../utils/errors';

const CONFIG_ROOT = process.env.CONFIG_ROOT ?? path.resolve(process.cwd(), 'config');

const cache = new Map<string, unknown>();

async function readYamlFile(filePath: string): Promise<unknown> {
  try {
    const fileContents = await fs.readFile(filePath, 'utf-8');
    return YAML.parse(fileContents, { prettyErrors: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ConfigurationError(`Missing configuration file: ${filePath}`);
    }
    throw new ConfigurationError(
      `Failed to read configuration file ${filePath}: ${(error as Error).message}`
    );
  }
}

function validate<T>(schema: ZodType<T>, value: unknown, fileLabel: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : JSON.stringify(error);
    throw new ConfigurationError(
      `Invalid configuration in ${fileLabel}: ${message}`
    );
  }
}

async function loadConfigFile<T>(
  schema: ZodType<T>,
  relativePath: string,
  explicitPath?: string
): Promise<T> {
  const resolvedPath = explicitPath ?? path.resolve(CONFIG_ROOT, relativePath);

  if (cache.has(resolvedPath)) {
    return cache.get(resolvedPath) as T;
  }

  const yamlValue = await readYamlFile(resolvedPath);
  const parsed = validate(schema, yamlValue, resolvedPath);
  cache.set(resolvedPath, parsed);
  return parsed;
}

export function clearConfigCache(): void {
  cache.clear();
}

export async function loadSourcesConfig(overridePath?: string): Promise<SourcesFile> {
  return loadConfigFile<SourcesFile>(
    SourcesFileSchema as unknown as ZodType<SourcesFile>,
    'sources.yaml',
    overridePath
  );
}

export async function loadPipelineConfig(overridePath?: string): Promise<PipelineFile> {
  return loadConfigFile<PipelineFile>(
    PipelineFileSchema as unknown as ZodType<PipelineFile>,
    'pipeline.yaml',
    overridePath
  );
}

export async function loadLlmConfig(overridePath?: string): Promise<LlmFile> {
  return loadConfigFile<LlmFile>(
    LlmFileSchema as unknown as ZodType<LlmFile>,
    'llm.yaml',
    overridePath
  );
}

export function getConfigRoot(): string {
  return CONFIG_ROOT;
}
