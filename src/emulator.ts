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

require('source-map-support').install();

import {FileRom} from './hardware/file-rom';
import {Z80Cpu} from './hardware/arch/z80';
import {GateArray} from './hardware/gate-array';
import {IoLink} from './hardware/cpu';
import {IoBus} from './hardware/io-bus';
import {Ram} from './hardware/ram';
import {Crtc} from './hardware/crtc';
import {IC8255} from './hardware/ic-8255';
import {FDC} from './hardware/fdc';

import EventEmitter = require('eventemitter3');
import fs = require('fs');

export class Emulator 
  extends EventEmitter
{
  private cpu:Z80Cpu;
  private ioBus:IoBus;
  public  gateArray: GateArray;
  private crtc: Crtc;
  private ic8255: IC8255;
  private fdc: FDC;
  
  constructor() {
    super();
    
    this.cpu = new Z80Cpu();
    this.ioBus = new IoBus();
    this.gateArray = new GateArray();
    this.crtc = new Crtc();
    this.ic8255 = new IC8255();
    this.fdc = new FDC();
    
    //See http://www.cpcwiki.eu/index.php/Default_I/O_Port_Summary
    this.ioBus.connect(0xC000, 0x4000, this.gateArray.port);
    this.ioBus.connect(0x4300, 0x0,    this.crtc.indexPort);
    this.ioBus.connect(0x4300, 0x100,  this.crtc.dataOutPort);
    this.ioBus.connect(0x4300, 0x200,  this.crtc.statusPort);
    this.ioBus.connect(0x4300, 0x300,  this.crtc.dataInPort);
    this.ioBus.connect(0x2000, 0x0,    this.gateArray.romBankPort);
    this.ioBus.connect(0x0B00, 0x0,    this.ic8255.portA);
    this.ioBus.connect(0x0B00, 0x100,  this.ic8255.portB);
    this.ioBus.connect(0x0B00, 0x200,  this.ic8255.portC);
    this.ioBus.connect(0x0B00, 0x300,  this.ic8255.control);
    this.ioBus.connect(0x0580, 0x0,    this.fdc.motorPort());
    this.ioBus.connect(0x0581, 0x100,  this.fdc.statusPort());
    this.ioBus.connect(0x0581, 0x101,  this.fdc.commandPort());

    this.cpu.attachBus(this.gateArray);
    this.cpu.attachIoBus(this.ioBus);

    console.log('Loading firmware rom...');

    const osRom = new FileRom();
    const basicRom = new FileRom();
    const amsdosRom = new FileRom();
    const ram = new Ram(64 * 1024);

    this.gateArray.ram = ram.buffer;
    this.gateArray.connectCrtc(this.crtc);
    this.gateArray.connectCpu(this.cpu);
    this.gateArray.ic8255 = this.ic8255;
    this.gateArray.fdc = this.fdc;
    
    osRom.loadFile('firmware/OS464.ROM');
    osRom.on('ready', () => {
      basicRom.loadFile('firmware/BASIC1-0.ROM');
      basicRom.on('ready', () => {
        amsdosRom.loadFile('firmware/AMSDOS.ROM');
        amsdosRom.on('ready', () => {
        
          this.gateArray.lowerRom       = osRom.buffer;
          this.gateArray.upperRom[0]    = basicRom.buffer;
          this.gateArray.upperRom[0x7]  = amsdosRom.buffer;
          this.gateArray.reset();
          this.emit('ready');

          this.fdc.loadDisc('test/Boulder Dash (UK) (1984).dsk');
        });
      });
    });
    
    window.addEventListener('keydown', (e) => {
      this.ic8255.handleEvent(e);
    });
    
    window.addEventListener('keyup', (e) => {
      this.ic8255.handleEvent(e);
    });
  }  
  
  public attachScreen(data: CanvasRenderingContext2D) {
    this.gateArray.attachScreen(data);
  }
  
  public tick() {
    this.gateArray.tick(1);
  }
}

