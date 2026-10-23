/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CadCreatorApp } from './app/CadCreatorApp';
import {CadStandaloneShell} from './app/CadStandaloneShell';
import { resolveCadAccessMode } from './lib/project-access';

export function App() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get('presentation') === 'embedded';
  const accessMode = resolveCadAccessMode(params.get('access'), window.location.hostname);
  return embedded ? <CadCreatorApp presentation="embedded" accessMode={accessMode}/> : <CadStandaloneShell/>;
}

export default App;
