/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { test, expect } from './npmTest';
import * as path from 'path';
import * as fs from 'fs';
import { TestServer } from '../../utils/testserver';

// Skipping docker tests on CI on non-linux since GHA does not have
// Docker engine installed on macOS and Windows.
test.skip(() => process.env.CI && process.platform !== 'linux');

test.beforeAll(async ({ exec }) => {
  // Delete any previous docker image to ensure clean run.
  await exec('npx playwright docker delete-image', {
    cwd: path.join(__dirname, '..', '..'),
  });
});

test('make sure it tells to run `npx playwright docker build` when image is not instaleld', async ({ exec }) => {
  await exec('npm i --foreground-scripts @playwright/test');
  const result = await exec('npx playwright docker test docker.spec.js', {
    expectToExitWithError: true,
  });
  expect(result).toContain('npx playwright docker build');
});

test.describe('installed image', () => {
  test.beforeAll(async ({ exec }) => {
    await exec('npx playwright docker build', {
      env: { PWTEST_DOCKER_BASE_IMAGE: 'playwright:installation-tests-focal' },
      cwd: path.join(__dirname, '..', '..'),
    });
  });
  test.afterAll(async ({ exec }) => {
    await exec('npx playwright docker delete-image', {
      cwd: path.join(__dirname, '..', '..'),
    });
  });

  test('make sure it auto-starts container', async ({ exec }) => {
    await exec('npm i --foreground-scripts @playwright/test');
    await exec('npx playwright docker stop');
    const result = await exec('npx playwright docker test docker.spec.js --grep platform');
    expect(result).toContain('@chromium Linux');
  });

  test.describe('running container', () => {
    test.beforeAll(async ({ exec }) => {
      await exec('npx playwright docker start', {
        cwd: path.join(__dirname, '..', '..'),
      });
    });

    test.afterAll(async ({ exec }) => {
      await exec('npx playwright docker stop', {
        cwd: path.join(__dirname, '..', '..'),
      });
    });

    test('all browsers work headless', async ({ exec }) => {
      await exec('npm i --foreground-scripts @playwright/test');
      const result = await exec('npx playwright docker test docker.spec.js --grep platform --browser all');
      expect(result).toContain('@chromium Linux');
      expect(result).toContain('@webkit Linux');
      expect(result).toContain('@firefox Linux');
    });

    test('all browsers work headed', async ({ exec }) => {
      await exec('npm i --foreground-scripts @playwright/test');
      {
        const result = await exec(`npx playwright docker test docker.spec.js --headed --grep userAgent --browser chromium`);
        expect(result).toContain('@chromium');
        expect(result).not.toContain('Headless');
        expect(result).toContain(' Chrome/');
      }
      {
        const result = await exec(`npx playwright docker test docker.spec.js --headed --grep userAgent --browser webkit`);
        expect(result).toContain('@webkit');
        expect(result).toContain(' Version/');
      }
      {
        const result = await exec(`npx playwright docker test docker.spec.js --headed --grep userAgent --browser firefox`);
        expect(result).toContain('@firefox');
        expect(result).toContain(' Firefox/');
      }
    });

    test('screenshots have docker suffix', async ({ exec, tmpWorkspace }) => {
      await exec('npm i --foreground-scripts @playwright/test');
      await exec('npx playwright docker test docker.spec.js --grep screenshot --browser all', {
        expectToExitWithError: true,
      });
      const files = await fs.promises.readdir(path.join(tmpWorkspace, 'docker.spec.js-snapshots'));
      expect(files).toContain('img-chromium-docker.png');
      expect(files).toContain('img-firefox-docker.png');
      expect(files).toContain('img-webkit-docker.png');
    });

    test('port forwarding works', async ({ exec, tmpWorkspace }) => {
      await exec('npm i --foreground-scripts @playwright/test');
      const TEST_PORT = 8425;
      const server = await TestServer.create(tmpWorkspace, TEST_PORT);
      server.setRoute('/', (request, response) => {
        response.end('Hello from host');
      });
      const result = await exec('npx playwright docker test docker.spec.js --grep localhost --browser all', {
        env: {
          TEST_PORT: TEST_PORT + '',
        },
      });
      expect(result).toContain('@chromium Hello from host');
      expect(result).toContain('@webkit Hello from host');
      expect(result).toContain('@firefox Hello from host');
    });
  });
});

