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

import {IoPort} from './io-port';

interface IoPortConnection {
  mask: number;
  addr: number;
  port: IoPort;
}

export class IoBus {
  private value: number = 0x0;
  private currentAddress: number;
  private ports: IoPortConnection[] = [];
  private selectedPorts: IoPort[] = [];

  constructor() {
  }

  connect(mask: number, addr: number, port: IoPort) {
    this.ports.push({
      mask: mask,
      addr: addr,
      port: port
    });
  }

  select(port: number) {
    //console.log('IO Select', port.toString(16));
    this.selectedPorts = [];

    for(let connection of this.ports) {
      if((port & connection.mask) === connection.addr) {
        this.selectedPorts.push(connection.port);
      }
    }

    //this.read();
  }

  write(value: number) {
    this.value = value;
    for(let i=0; i < this.selectedPorts.length; i++) {
      this.selectedPorts[i].write(value);
    }
  }

  read(): number {
    for(let i=0; i < this.selectedPorts.length; i++) {
      this.value = this.selectedPorts[i].read();
    }

    return this.value;
  }
};