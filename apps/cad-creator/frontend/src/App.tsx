/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { CadCreatorApp } from './app/CadCreatorApp';

export function App() {
  const embedded = new URLSearchParams(window.location.search).get('presentation') === 'embedded';
  return <CadCreatorApp presentation={embedded ? 'embedded' : 'standalone'} />;
}

export default App;
