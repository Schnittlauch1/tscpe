/*  TSEPC
    Copyright (C) 2016  Phil Lehmkuhl

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

'use strict';

import electron = require('electron');

const app = electron.app;
let mainWindow: Electron.BrowserWindow;

require('source-map-support').install();

app.on('ready', () => { 
  mainWindow = new electron.BrowserWindow({ width: 800, height: 600});
  
  mainWindow.maximize();
  mainWindow.loadURL('file://' + __dirname + '/../src/emulator.html');
  mainWindow.webContents.openDevTools();
});