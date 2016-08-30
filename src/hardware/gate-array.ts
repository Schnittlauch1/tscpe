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

import {Bus} from './bus';
import {IoPort} from './io-port';
import {Crtc} from './crtc';
import {Z80Cpu} from './arch/z80';
import {IC8255} from './ic-8255';
import {FDC} from './fdc';

import EventEmitter = require('eventemitter3');

type ColorPallette = { [idx: number]: { r: number, g: number, b: number }};
const hwColor = [
  { r: .5, g: .5, b: .5 },
  { r: .5, g: .5, b: .5 },
  { r:  0, g:  1, b: .5 },
  { r:  1, g:  1, b: .5 },
  { r:  0, g:  0, b: .5 },
  { r:  1, g:  0, b: .5 },
  { r:  0, g: .5, b: .5 },
  { r:  1, g: .5, b: .5 },
  { r:  1, g:  0, b: .5 },
  { r:  1, g:  1, b: .5 },
  { r:  1, g:  1, b:  0 },
  { r:  1, g:  1, b:  1 },
  { r:  1, g:  0, b:  0 },
  { r:  1, g:  0, b:  1 },
  { r:  1, g: .5, b:  0 },
  { r:  1, g: .5, b:  1 },
  { r:  0, g:  0, b: .5 },
  { r:  0, g:  1, b: .5 },
  { r:  0, g:  1, b:  0 },
  { r:  0, g:  1, b:  1 },
  { r:  0, g:  0, b:  0 },
  { r:  0, g:  0, b:  1 },
  { r:  0, g: .5, b:  0 },
  { r:  0, g: .5, b:  1 },
  { r: .5, g:  0, b: .5 },
  { r: .5, g:  1, b: .5 },
  { r: .5, g:  1, b:  0 },
  { r: .5, g:  1, b:  1 },
  { r: .5, g:  0, b:  0 },
  { r: .5, g:  0, b:  1 },
  { r: .5, g: .5, b:  0 },
  { r: .5, g: .5, b:  1 }
];

const hwColorCache: Uint32Array = new Uint32Array(hwColor.length);

export class GateArray 
  implements Bus 
{
  private io: IoPort = new IoPort;
  private romIo: IoPort = new IoPort;
  public mapped: Uint8Array = new Uint8Array(64 * 1024);
  public ram: Uint8Array = null;
  public lowerRom: Uint8Array = null;
  public upperRom: Uint8Array[] = [];
  private selectedRom: number = 0;
  private crtc: Crtc = null;
  private cpu: Z80Cpu = null;
  public ic8255: IC8255 = null;
  public fdc: FDC = null;

  private lowerRomEnabled: boolean = false;
  private upperRomEnabled: boolean = false;
  
  public screen: Uint8Array = null;
  private screenImage: ImageData = null;
  private screenBuffer: Uint32Array = null;
  private scanline: Uint32Array = new Uint32Array(640);
  
  private mode: number = 1;
  private modeRequested: number = 1;
  private modeRenderer: ((pixelData:number) => Uint32Array)[] = null;
  private pens: Buffer = new Buffer(16);
  private borderPen: number = 0;
  private selectedPen: number = 0;
  private borderSelected: boolean = false;
  
  private lineCount: number = 0;
  private lineCountDelay: number = 0;
  
  private vsyncState: boolean = false;
  private hsyncState: boolean = false;
  
  private slowTimer: number = 0;
  private fastTimer: number = 0;
  
  private drawPosX: number = 0;
  private drawPosY: number = 0;
  private delayCounter: boolean = false;
  private frameCount: number = 0;
  
  private cpuWaitStates: number = 0;
  
  private frameBuffer: HTMLCanvasElement = null;
  private monitorContext: CanvasRenderingContext2D = null;
  
  constructor() {
    this.mode = 1;
    this.modeRenderer = [
      this.modeZeroPixels,
      this.modeOnePixels,
      this.modeTwoPixels
    ];
    
    for(let i=0; i < hwColor.length; i++) {
      hwColorCache[i] = this.calculateColor(i);
    }
    
    for(let i=0; i < this.pens.length; i++) {
      this.pens[i] = i;
    }

    this.romIo.on('write', (val) => {
      let upperEnabled = this.upperRomEnabled;
      if(upperEnabled) {
        this.mapUpperRom(false);
        this.selectedRom = val;
        this.mapUpperRom(true);
      } else {
        this.selectedRom = val;
      }
    });
    
    this.io.on('write', (val) => {
      switch(val & 0xC0) {
        case 0x00:
          if(val & 0x10) {
            this.borderSelected = true;
          } else {
            this.borderSelected = false;
            this.selectedPen = val & 0xF;
          }
          break;
        
        case 0x40:
          if(this.borderSelected) {
            this.borderPen = (val & 0x1F);
          } else {
            this.pens[this.selectedPen] = (val & 0x1F);
            //console.log('Pen ' + this.selectedPen + ' --> ' + (val & 0x1F));
          }
          break;
        
        case 0x80:
          if(val & 0x10) {
            this.lineCount = 0;
          }
          
          this.mapLowerRom((val & 0x4) === 0);
          this.mapUpperRom((val & 0x8) === 0);

          this.modeRequested = (val & 0x3);
          break;
      }
    });
    
    setInterval(() => {
      //console.log('FPS: ' + this.frameCount);
      this.frameCount = 0;
    }, 1000);
  }
  
  public reset() {
    this.mapLowerRom(true);
  }
  
  public attachScreen(ctx: CanvasRenderingContext2D) {
    this.monitorContext = ctx;
    this.screenImage = ctx.createImageData(640, 480);
    this.screenBuffer = new Uint32Array(this.screenImage.data.buffer);
  }

  get port(): IoPort {
    return this.io.writeonly;
  }
  
  get romBankPort(): IoPort {
    return this.romIo.writeonly;
  }
  
  public mapLowerRom(map: boolean) {
    if(map === this.lowerRomEnabled) { return; }
    
    this.lowerRomEnabled = map;
    
    if(map) {
      this.mapped.set(this.lowerRom, 0);
    } else {
      this.mapped.set(this.ram.slice(0, this.lowerRom.length), 0);
    }
  }
  
  public mapUpperRom(map: boolean) {
    if(map === this.upperRomEnabled) { return; }
    
    this.upperRomEnabled = map;
    
    if(map && this.upperRom[this.selectedRom]) {
      this.mapped.set(this.upperRom[this.selectedRom], 0xC000);
    } else {
      this.mapped.set(this.ram.slice(0xC000, 0xFFFF), 0xC000);
    }
  }

  public readMemory(address: number): number { 
    /*if(this.lowerRomEnabled && address >= 0x0000 && address <= 0x3FFF) {
      return this.lowerRom.readMemory(address)|0;
    } 
    
    if(this.upperRomEnabled && address >= 0xC000 && address <= 0xFFFF) {
      return this.upperRom.readMemory(address - 0xC000)|0;
    }
    
    return this.ram.readMemory(address)|0;*/
    return this.mapped[address];
  }

  public readBlock(address: number, size: number): Uint8Array {
    return this.mapped.slice(address, address + size);
  }

  public writeMemory(address: number, value: number) {
    this.ram[address] = value;
    
    if(address > 0x0 && address < 0xC000) {
      this.mapped[address] = value;
    } else if(address <= 0x3FFF && !this.lowerRomEnabled) {
      this.mapped[address] = value;
    } else if(address >= 0xC000 && !this.upperRomEnabled) {
      this.mapped[address] = value;
    }
  }
  
  public connectCpu(cpu: Z80Cpu) {
    this.cpu = cpu;
    this.cpu.on('INTACK', () => {
      this.cpu.interrupt = false;
      this.lineCount &= ~0x10;
    });
  }
  
  public connectCrtc(crtc: Crtc) {
    this.crtc = crtc;
    this.crtc.on('frame_start', () => {
      this.drawPosX = 0;
      this.drawPosY = 0;
    });
  }
  
  private clrBuff = new Uint8Array(4);
  private crlView = new DataView(this.clrBuff.buffer);
  
  private calculateColor(hwNumber: number): number {
    let clrDef = hwColor[hwNumber];
    this.clrBuff[3] = ((255 * clrDef.r) & 0xFF);
    this.clrBuff[2] = ((255 * clrDef.g) & 0xFF);
    this.clrBuff[1] = ((255 * clrDef.b) & 0xFF);
    this.clrBuff[0] = 0xFF;

    return this.crlView.getUint32(0, false);
  }
  
  private getColor(penNum: number): number {
    return hwColorCache[this.pens[penNum]];
  }
  
  private pixelBuffer: Uint32Array = new Uint32Array(8);
  
  private modeZeroPixels(pixelData: number): Uint32Array {
    let pix1 = 0;
    let pix2 = 0;
    
    pix1 |= (pixelData & 0x2) << 2;
    pix1 |= (pixelData & 0x8) >> 2;
    pix1 |= (pixelData & 0x20) >> 3;
    pix1 |= (pixelData & 0x80) >> 7;
    pix2 |= (pixelData & 0x1) << 3;
    pix2 |= (pixelData & 0x4) >> 1;
    pix2 |= (pixelData & 0x10) >> 2;
    pix2 |= (pixelData & 0x40) >> 6;
    
    pix1 = this.getColor(pix1);
    pix2 = this.getColor(pix2);
    
    this.pixelBuffer[0] = pix1;
    this.pixelBuffer[1] = pix1;
    this.pixelBuffer[2] = pix1;
    this.pixelBuffer[3] = pix1;
    this.pixelBuffer[4] = pix2;
    this.pixelBuffer[5] = pix2;
    this.pixelBuffer[6] = pix2;
    this.pixelBuffer[7] = pix2;
    
    return this.pixelBuffer;
  }
  
  private modeOneStaticBuffer: Uint8Array = new Uint8Array(4);
  
  private modeOnePixels(pixelData: number): Uint32Array {
    let pix = this.modeOneStaticBuffer;

    pix[0] = (pixelData & 0x8) >> 2;
    pix[0] |= (pixelData & 0x80) >> 7;
    pix[1] = (pixelData & 0x4) >> 1;
    pix[1] |= (pixelData & 0x40) >> 6;
    pix[2] = (pixelData & 0x2);
    pix[2] |= (pixelData & 0x20) >> 5;
    pix[3] = (pixelData & 0x1) << 1;
    pix[3] |= (pixelData & 0x10) >> 4;
    
    for(let i=0; i < pix.length; i++) {
      this.pixelBuffer[i * 2]   = this.getColor(pix[i]);
      this.pixelBuffer[(i * 2)+1] = this.pixelBuffer[i * 2];
    }
     
    return this.pixelBuffer;   
  }
  
  private modeTwoPixels(pixelData: number): Uint32Array {
    for(let i=0; i < 8; i++) {
      let pix = ((pixelData & (0x1 << i)) >> i);
      this.pixelBuffer[i] = this.getColor(pix);
    }
        
    return this.pixelBuffer;
  }
  
  private drawPixels(ma: number) {
    let pixelData = this.ram[ma];
    let texturePtr: number = this.drawPosX; // + (this.drawPosY * 640);
    
    this.modeRenderer[this.mode].call(this, pixelData);
    //console.log(this.drawPosX + ' / ' + this.drawPosY);
      
    for(var i=0; i < 8; i++) {
      texturePtr++;
      this.scanline[texturePtr] = this.pixelBuffer[i]; 
    }
  }
  
  private createVideoSignal() {
    let ma = this.crtc.ma|0;
    let ra = this.crtc.ra|0;
    
    /*let pixeloffset = 0|0;
    pixeloffset |= (this.crtc.ma & 0x3000) << 2;
    pixeloffset |= (ra & 0x7) << 11;
    pixeloffset |= (ma & 0x3FF) << 1;*/
    
    let pixeloffset = (this.crtc.ma & 0x3000) << 2; 
    pixeloffset |= (ra & 0x7) << 11; 
    pixeloffset |= (ma & 0x3FF) << 1;
    
    this.drawPixels(pixeloffset);
    this.drawPosX += 8;
    this.drawPixels(pixeloffset|0x1);
    this.drawPosX += 8;;
  }

  private updateSlowTimer() {
    if(this.slowTimer === 4) {
      this.triggerSlowTimer();
      this.slowTimer = 0;
    } else {
      this.slowTimer++;
    }
  }
  
  private frameComplete: boolean = false;
  
  private updateScreen() {
    
    if(this.drawPosY > 400) { return; }
    //this.emit('vsync');
    this.screenBuffer.set(this.scanline, this.drawPosY * this.screenImage.width);
    this.screenBuffer.set(this.scanline, (this.drawPosY + 1) * this.screenImage.width);
    //this.monitorContext.putImageData(this.screenImage, 0, this.drawPosY + 1);
    //this.frameComplete = true;
  }
  
  private updateLineCount() {
    if(this.lineCountDelay) {
      this.lineCountDelay--;
      if(this.lineCountDelay === 0) {
        if(this.lineCount >= 32) {
          this.lineCount = 0;
        }
      }
    } else {
      this.lineCount++;
      if(this.lineCount === 52) {
        this.lineCount = 0;
        this.cpu.interrupt = true;
      }
    }
  }
  
  private triggerSlowTimer() {
    this.crtc.tick(1);
    this.fdc.tick();

    if(!this.crtc.dispen) {
      this.createVideoSignal();
    }

    if(!this.crtc.hsync && this.hsyncState) {
      if(!this.crtc.vsync) {
        this.updateScreen();
      }
      
      this.drawPosX = 0;
      this.drawPosY+=2;
      
      if(this.mode !== this.modeRequested) {
        console.log('Change mode: ' + this.modeRequested);
      }

      this.mode = this.modeRequested;
      
      this.updateLineCount();
    }
    
    this.hsyncState = this.crtc.hsync;
    this.ic8255.vsync = this.crtc.vsync;

    if(!this.crtc.vsync && this.vsyncState) {
      this.monitorContext.putImageData(this.screenImage, 0, 0);      
      
      this.lineCountDelay = 2;
      this.frameComplete = true;
      //this.updateScreen();
    }
    
    this.vsyncState = this.crtc.vsync;
  }

  public tick(cycles: number) {
    this.frameComplete = false;
    
    do {
      if(this.cpuWaitStates === 0) {
        this.cpuWaitStates = this.cpu.tick(1);
      } else {
        this.cpuWaitStates--;
      }
      
      this.updateSlowTimer();
    }while(!this.frameComplete);
    
    if(this.frameComplete) {
      this.frameCount++;
    }
  }
}
