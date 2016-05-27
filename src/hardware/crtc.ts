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
import EventEmitter = require('eventemitter3');

class CrtcRegister 
  extends EventEmitter
{
  private data: Uint8Array = new Uint8Array(1);
  private mask: number;
  
  constructor(mask: number) {
    super();
    
    this.mask = mask;
  }
  
  get uint(): number {
    return this.data[0];
  }
  
  set uint(val: number) {
    this.data[0] = (val & this.mask);
  }
}

class CrtcAddressRegister {
  private data: Uint16Array = new Uint16Array(1);
  private byteData: Uint8Array = new Uint8Array(this.data.buffer);

  constructor() {
  }
  
  get uint(): number {
    return this.data[0];
  }
  
  set uint(val: number) {
    this.data[0] = val & 0xFFFF;
  }  
  
  get hi(): number {
    return this.byteData[1];
  }
  
  set hi(val: number) {
    this.byteData[1] = val;
  }
  
  get lo(): number {
    return this.byteData[0];
  }
  
  set lo(val: number) {
    this.byteData[0] = val;
  }
}

//See http://www.cpcwiki.eu/index.php/VHDL_implementation_of_the_6845
export class Crtc 
  extends EventEmitter
{
  private regIndex = new CrtcRegister(0x1F);
  private reg = [
    new CrtcRegister(0xFF),
    new CrtcRegister(0xFF),
    new CrtcRegister(0xFF),
    new CrtcRegister(0xFF),
    new CrtcRegister(0x7F),
    new CrtcRegister(0x1F),
    new CrtcRegister(0x7F),
    new CrtcRegister(0x7F),
    new CrtcRegister(0x03),
    new CrtcRegister(0x1F),
    new CrtcRegister(0x1F),
    new CrtcRegister(0x1F),
    new CrtcRegister(0x3F),
    new CrtcRegister(0xFF),
    new CrtcRegister(0x3F),
    new CrtcRegister(0xFF)
  ];
  
  private indexPort_: IoPort = new IoPort;
  private dataOutPort_: IoPort = new IoPort;
  private statusPort_: IoPort = new IoPort;
  private dataInPort_: IoPort = new IoPort;
  
  private vsync_: boolean = false;
  private hsync_: boolean = false;
  private dispen_: boolean = false;
  private reset_: boolean = true;
  
  private maRegister: number = 0;
  private raRegister: number = 0;
  
  private ctr_horiz: number = 0;
  private ctr_hsw: number = 0;
  private ctr_sl: number = 0;
  private ctr_vert: number = 0;
  private ctr_vsw: number = 0;
  private rowadr: number = 0;

  get indexPort(): IoPort { return this.indexPort_.writeonly; }
  get dataOutPort(): IoPort { return this.dataOutPort_.writeonly; }
  get statusPort(): IoPort { return this.statusPort_.readonly; }
  get dataInPort(): IoPort { return this.dataInPort_.readonly; }

  constructor() {
    super();
    
    this.indexPort_.on('write', (val) => {
      this.selectRegister(val);
    });

    this.dataOutPort_.on('write', (val) => {
      this.updateRegister(val);
    });
    
    this.reg[0].uint = 63;
    this.reg[1].uint = 40;
    this.reg[2].uint = 46;
    this.reg[3].uint = 128+14;
    this.reg[4].uint = 38;
    this.reg[6].uint = 25;
    this.reg[7].uint = 30;
    this.reg[9].uint = 7;
    this.reg[12].uint = 32; 
  }
  
  public get hsync(): boolean {
    return this.hsync_;
  }
  
  public get vsync(): boolean {
    return this.vsync_;
  }
  
  public get dispen(): boolean {
    return this.dispen_;
  }
  
  public get ma(): number {
    return this.maRegister;
  }
  
  public get ra(): number {
    return this.raRegister;
  }

  private selectRegister(val: number) {
    this.regIndex.uint = val;
    
    if(val >= 10) {
      this.dataInPort_.value = this.reg[this.regIndex.uint].uint;
    }
  }

  private updateRegister(val: number) {
    //if(this.regIndex.uint === 12 || this.regIndex.uint === 13) {
      //console.log(this.regIndex.uint + ' --> ' + val.toString(16));
      //this.emit('debug');
    //}
    
    this.reg[this.regIndex.uint].uint = val;
    this.selectRegister(this.regIndex.uint);
  }
  
  private frameStart() {
    this.emit('frame_start');
    
    this.ctr_vert = 0;
    this.ctr_horiz = 0;
    this.ctr_vsw = 0;
    this.ctr_hsw = 0;
    this.raRegister = 0;
    this.rowadr = (this.reg[12].uint << 8) | this.reg[13].uint;
    this.maRegister = this.rowadr;
    this.vsync_ = false;
    this.hsync_ = false;
    this.dispen_ = false;
  }

  private horzEnd() {
    this.ctr_horiz = 0;
    if(this.raRegister == this.reg[9].uint) {
      this.scanlineEnd();
    } else {
      this.raRegister++;
    }
    
    this.maRegister = this.rowadr;
    this.beginRow = true;
  }
  
  private scanlineEnd() {
    this.raRegister = 0;
    this.rowadr += this.reg[1].uint;
    
    if(this.ctr_vert == this.reg[4].uint) {
      this.vertEnd();
    } else {
      this.ctr_vert++;
      
      if(this.vsync_) {
        this.ctr_vsw++;
      }
    }
  }
  
  private vertEnd() {
    this.beginFrame = true;
  }
  
  private beginFrame: boolean = true;
  private beginRow: boolean = true;

  //See http://www.cpcwiki.eu/imgs/c/c0/Hd6845.hitachi.pdf
  public tick(cycles: number) {  
    for(let c=0; c < cycles; c++) {
      if(this.beginFrame) {
        this.frameStart();
        this.beginFrame = false;
      } else {
        if(!this.beginRow) {
          this.ctr_horiz++;
          this.maRegister++;
        } else {
          this.beginRow = false;
          
          if(this.ctr_vert < this.reg[6].uint) {
            this.dispen_ = false;
          } else {
            this.dispen_ = true;
          }
        }
          
        if(this.hsync_) {
          this.ctr_hsw++;
        }

        if(this.ctr_horiz == this.reg[2].uint) {
          this.hsync_ = true;
        }
        
        if(this.ctr_vert == this.reg[6].uint) {
          this.vsync_ = true;
        }
        
        if(this.ctr_hsw == (this.reg[3].uint & 0xF)) {
          this.ctr_hsw = 0;
          this.hsync_ = false;
        }
        
        if(this.ctr_vsw == ((this.reg[3].uint & 0xF0) >> 4)) {
          this.ctr_vsw = 0;
          this.vsync_ = false;
        }
        
        if(this.ctr_horiz == this.reg[0].uint) {
          this.horzEnd();
        }
        
        if(this.ctr_horiz == this.reg[1].uint) {
          this.dispen_ = true;
        }
      }
      
      //console.log('SL ' + this.ctr_vert + ' / ' + this.raRegister + ' ' + this.maRegister.toString(16));
    }
  }
}
