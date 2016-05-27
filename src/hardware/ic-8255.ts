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
import {Crtc} from './crtc';
import {Psg} from './psg';

enum PsgFunction {
  Inactive,
  Read,
  Write,
  Select
};

export class IC8255 {

  
  private psg: Psg = new Psg();
  private portDataA: IoPort = new IoPort;
  private portDataB: IoPort = new IoPort;
  private portDataC: IoPort = new IoPort;
  private portControl: IoPort = new IoPort;
  
  private portAInput: boolean = false;
  private psgFnc: PsgFunction = PsgFunction.Inactive;
  
  private vsyncState: boolean = false;
  
  constructor() {
    this.portDataB.value = 0x5A;
    
    /*this.portDataA.on('read', (val) => {
      console.log('Read', val.toString(16));
    });*/
    
    this.portDataB.on('write', () => {
      if(this.vsyncState && !(this.portDataB.value & 0x1)) {
        this.portDataB.value |= 0x1;
      }
    });
    
    this.portDataC.on('write', () => {
      let psgFnc = (this.portDataC.value & 0xC0) >> 6;
      let oldFnc = this.psgFnc;
      
      this.psg.selectKeyboardRow(this.portDataC.value & 0xF);
      
      switch(psgFnc) {
        case 0x0:
          this.psgFnc = PsgFunction.Inactive;
          break;
          
        case 0x1:
          this.psgFnc = PsgFunction.Read;
          break;
          
        case 0x2:
          this.psgFnc = PsgFunction.Write;
          break;
          
        case 0x3:
          this.psgFnc = PsgFunction.Select;
          break;
      }
      
      if(this.psgFnc === PsgFunction.Read) {
        this.portDataA.value = this.psg.read();
      }
      
      if(oldFnc !== PsgFunction.Inactive && this.psgFnc === PsgFunction.Inactive) {
        switch(oldFnc) {
          case PsgFunction.Write:
            this.psg.write(this.portDataA.value);
            break;
            
          case PsgFunction.Select:
            this.psg.selectRegister(this.portDataA.value);
            break;
        }
      }
    });
    
    this.portControl.on('write', () => {
      if(this.portControl.value & 0x80) {
        this.portDataA.value = 0;
        this.portDataB.value = 0x5A;
        this.portDataC.value = 0;
        
        this.portAInput = (this.portControl.value & 0x10) !== 0;
      } else {
        let bitVal = this.portControl.value & 0x1;
        let bit = (this.portControl.value & 0xE) >> 1;
        
        this.portDataC.value &= ~(bitVal << bit);
        this.portDataC.value |= bitVal << bit;
      }
    });
  }
  
  set vsync(val: boolean) {
    this.vsyncState = val;
    
    if(val) {
      this.portDataB.value |= 0x1;
    } else {
      this.portDataB.value &= ~0x1;
    }
  }
  
  get portA(): IoPort {
    return this.portDataA;
  }
  
  get portB(): IoPort {
    return this.portDataB;
  }
  
  get portC(): IoPort {
    return this.portDataC;
  }
  
  get control(): IoPort {
    return this.portControl.writeonly;
  }
  
  public handleEvent(e: Event) {
    this.psg.handleKeyEvent(<KeyboardEvent>e);
  }
}