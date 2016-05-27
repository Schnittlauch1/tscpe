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

import {Rom} from './rom';
import EventEmitter = require('eventemitter3');
import fs = require('fs');

export class FileRom extends EventEmitter implements Rom {
  private data: Uint8Array = null;
  private loaded: boolean = false;

  constructor() {
    super();
  }

  loadFile(path: string) {
    fs.readFile(path, (err, data) => {
      if(err) {
        this.emit('error', err);
        return;
      }

      this.data = new Uint8Array(data);
      this.emit('ready');
    });
  }

  isValid(): boolean {
    return this.loaded;
  }

  readMemory(address: number): number {
    return this.data[address];
  }

  writeMemory(address: number, value: number) {
    //Its a rom! No writing!
  }
  
  get buffer(): Uint8Array {
    return this.data;
  }
}
