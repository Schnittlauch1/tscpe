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

import EventEmitter = require('eventemitter3');

export class IoPort extends EventEmitter {
  private register: number;
  private readsignal: boolean;

  constructor(readsignal = false) {
    super();
    this.readsignal = readsignal;
  }

  get value(): number {
    //this.emit('read', this.register);
    return this.register;
  }

  set value(val: number) {
    this.register = val;
  }

  get readonly(): IoPort {
    return new ReadonlyIoPort(this);
  }

  get writeonly(): IoPort {
    return new WriteonlyIoPort(this);
  }
  
  public write(val: number) {
    this.register = val;
    this.emit('write', val);
  }
  
  public read(): number {
    let value = this.register;
    if(this.readsignal) { this.emit('read'); }
    return value;
  }
};

class ReadonlyIoPort extends IoPort {
  constructor(private port: IoPort) {
    super();
  }

  set value(val: number) {}
  get value(): number { return this.port.value; }
  
  public write(val: number) {
  }
  
  public read(): number {
    return this.port.read();
  }
}

class WriteonlyIoPort extends IoPort {
  constructor(private port: IoPort) {
    super();
  }

  get value(): number { return undefined; }
  set value(val: number) { this.port.value = val; }
  
  public write(val: number) {
    this.port.write(val);
  }
  
  public read(): number {
    return NaN;
  }
}
