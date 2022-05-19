import type { ProjectConfiguration, Tree } from '@nrwl/devkit';
import {
  formatFiles,
  generateFiles,
  names,
  offsetFromRoot,
  readProjectConfiguration,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import path from 'path';

import { mergeDeep } from '../../utils/merge-deep.util';

import type { ConfigGeneratorSchema } from './schema';
import { Framework, Testing } from './schema';

interface EslintConfig {
  extends: string[] | string;
  files: string[];
  parserOptions?: {
    project: string[];
  };
  rules: Record<string, unknown>;
}

interface NormalizedSchema extends ConfigGeneratorSchema {
  projectRoot: string;
  extensions: string[];
  overrides: EslintConfig[];
}

const normalizeOptions = (tree: Tree, options: ConfigGeneratorSchema): NormalizedSchema => {
  const { root: projectRoot, targets } = readProjectConfiguration(tree, options.projectName);
  const tsConfigPath = options.testing === Testing.Cypress ? 'tsconfig.json' : 'tsconfig.*?.json';

  const typeScriptExtensions =
    options.framework === Framework.React || options.framework === Framework.ReactNative
      ? ['ts', 'tsx']
      : ['ts'];

  const javaScriptExtensions =
    options.framework === Framework.React || options.framework === Framework.ReactNative
      ? ['js', 'jsx']
      : ['js'];

  const typeScriptPlugins = [
    `brandingbrand/${options.language}`,
    ...(options.framework !== Framework.None ? [`brandingbrand/${options.framework}`] : []),
    ...options.libraries.map((library) => `brandingbrand/${library}`),
  ];

  const overrides: EslintConfig[] = [
    {
      extends: typeScriptPlugins,
      files: typeScriptExtensions.map((extension) => `*.${extension}`),
      parserOptions: { project: [`${projectRoot}/${tsConfigPath}`] },
      rules: {},
    },
    ...(options.testing !== Testing.None
      ? [
          {
            extends: `brandingbrand/${options.testing}`,
            files: typeScriptExtensions.map((extension) => `*.spec.${extension}`),
            rules: {},
          },
        ]
      : []),
    ...('storybook' in (targets ?? {})
      ? [
          {
            extends: `brandingbrand/storybook`,
            files: typeScriptExtensions.flatMap((extension) => [
              `*.story.${extension}`,
              `*.stories.${extension}`,
            ]),
            rules: {},
          },
        ]
      : []),
  ];

  return {
    ...options,
    overrides,
    extensions: [...typeScriptExtensions, ...javaScriptExtensions],
    projectRoot,
  };
};

const mergeProjectConfiguration = (
  tree: Tree,
  projectName: string,
  configuration: Partial<ProjectConfiguration>
): void => {
  const existingConfiguration = readProjectConfiguration(tree, projectName);
  const mergedConfiguration = mergeDeep(existingConfiguration, configuration);
  updateProjectConfiguration(tree, projectName, mergedConfiguration);
};

const addEslintRc = (tree: Tree, options: NormalizedSchema): void => {
  const templateOptions = {
    ...options,
    ...names(options.projectName),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
  };
  // eslint-disable-next-line unicorn/prefer-module -- import.meta requires es2020 imports
  generateFiles(tree, path.join(__dirname, 'files'), options.projectRoot, templateOptions);
};

const runGenerator = async (tree: Tree, options: ConfigGeneratorSchema): Promise<void> => {
  const normalizedOptions = normalizeOptions(tree, options);
  addEslintRc(tree, normalizedOptions);
  mergeProjectConfiguration(tree, options.projectName, {
    targets: {
      lint: {
        executor: '@nrwl/linter:eslint',
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [
            `${normalizedOptions.projectRoot}/**/*.{${normalizedOptions.extensions.join(',')}}`,
          ],
          hasTypeAwareRules: true,
        },
      },
    },
  });
  await formatFiles(tree);
};

export default runGenerator;