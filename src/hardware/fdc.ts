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

import fs = require('fs');
import stream = require('stream');
import {IoPort} from './io-port';

const CommandLengths = {
  0x02: 8,
  0x03: 2,
  0x04: 1,
  0x05: 8,
  0x06: 8,
  0x07: 1,
  0x08: 0,
  0x09: 8,
  0x0A: 1,
  0x0C: 8,
  0x0D: 5,
  0x0F: 2,
  0x11: 8,
  0x19: 8,
  0x1D: 8
};

interface TrackInfo {
  id: number, 
  side: number, 
  sectorSize: number, 
  sectors: number, 
  gapLength: number, 
  filler: number,
  sector: SectorInfo[],
  offsets: any
}

interface SectorInfo {
  track: number,
  side: number,
  id: number,
  size: number,
  fdcStatus1: number,
  fdcStatus2: number
}

export class FDC {
  private motorIo: IoPort = new IoPort();
  private statusIo: IoPort = new IoPort();
  private commandIo: IoPort = new IoPort(true);
  private diskFile: number = -1;
  private extFromat: boolean = false;
  private sides: number = 0;
  private tracks: number = 0;
  private trackSize: number = 0;
  private fdcBusy: boolean = false;
  private busyFlag: boolean = false;
  private executionFlag: boolean = false;
  private outputFlag: boolean = false;
  private requestFlag: boolean = true;
  private cmd: number[] = [];
  private dataIo: number[] = [];
  private results: number[] = [];
  private driveHeadUnload: number = 0;
  private driveSteprate: number = 0;
  private driveDma: boolean = false;
  private trackNumber: number = 0;
  private trackNumberRequested: number = 0;
  private transferring: boolean = false;
  private icCode: number = 0;
  private seekDelay: number = 0;
  private currentTrack: TrackInfo = null;
  private currentUnit: number = 0;
  private currentHead: number = 0;
  
  constructor() {
    console.log('FDC Init');
    this.updateStatus();
    //this.reportStatus0(0, 0, false, true, 0);

    this.motorIo.on('write', (val) => {
      console.log('Motors -> '+ val.toString(16));
    });

    this.commandIo.on('write', (val) => {
      this.parseCommand(val);
    });

    this.commandIo.on('read', () => {
      this.transferResult();
    });
  }

  private readSector(sector: number): Buffer {
    let trackOffset = this.trackNumber * this.trackSize + 0x100;
    let sectorSize = 0x80 << this.currentTrack.sectorSize;
    let sectorOffset = sector * sectorSize + trackOffset + 0x100;
    let data: Buffer = new Buffer(sectorSize);
    fs.readSync(this.diskFile, data, 0, sectorSize, sectorOffset);

    return data;
  }

  private readTrackInfo() {
    let trackOffset = this.trackNumber * this.trackSize + 0x100;
    let trackHdr: Buffer = new Buffer(0xFF);
    fs.readSync(this.diskFile, trackHdr, 0, 0xFF, trackOffset);

    if(trackHdr.toString('UTF-8', 0, 10) === 'Track-Info') {
      this.currentTrack = {
        id: trackHdr.readUInt32LE(0x10),
        side: trackHdr.readUInt8(0x11),
        sectorSize: trackHdr.readUInt8(0x14),
        sectors: trackHdr.readUInt8(0x15),
        gapLength: trackHdr.readUInt8(0x16),
        filler: trackHdr.readUInt8(0x17),
        sector: [],
        offsets: {}
      };

      for(let i=0; i < this.currentTrack.sectors; i++) {
        let offset = 0x18 + (i * 8);
        this.currentTrack.sector.push({
          track: trackHdr.readUInt8(offset + 0x0),
          side: trackHdr.readUInt8(offset + 0x1),
          id: trackHdr.readUInt8(offset + 0x02),
          size: trackHdr.readUInt8(offset + 0x03),
          fdcStatus1: trackHdr.readUInt8(offset + 0x04),
          fdcStatus2: trackHdr.readUInt8(offset + 0x05)
        });
        this.currentTrack.offsets[trackHdr.readUInt8(offset + 0x02)] = i;
      }
    } else {
      console.log('Info', trackHdr.toString('UTF-8', 0, 10));
      console.error('Corrupted disc file!');
    }
  }

  private parseCommand(cmdByte: number) {
    //console.log('RX: ' + cmdByte.toString(16));

    this.fdcBusy = true;
    this.requestFlag = true;

    this.cmd.push(cmdByte);

    if(this.cmd.length-1 === CommandLengths[this.cmd[0] & 0x1F]) {
      this.runCommand(this.cmd);
      this.cmd = [];
    } else {
      this.updateStatus();
    }
  }

  private writeData(byte: number) {

  }

  private runCommand(cmd: number[]) {
    this.executionFlag = true;
    this.requestFlag = false;

    let cmdByte = cmd[0];
    switch(cmdByte & 0x1F) {
      case 0x03:
        this.driveHeadUnload = (cmd[1] & 0xF) * 32;
        this.driveSteprate = ((cmd[1] & 0xF0) >> 4) * 2;
        this.driveDma = (cmd[2] & 0x1) === 1;
        break;

      case 0x06:
        this.currentUnit = this.cmd[1] & 0x3;
        this.currentHead = this.cmd[1] & 0x4 >> 2;
        
        if(this.currentUnit === 0 && this.currentHead === 0) {
          this.busyFlag = true;
          this.seekDelay = 1;

          let len = this.cmd[5];
          let trackId: number = this.cmd[2];
          let sector: number = this.currentTrack.offsets[this.cmd[4]];
          let sectorLast: number = this.currentTrack.offsets[this.cmd[6]];

          //console.log('Read Track ' + trackId);

          if(trackId !== this.currentTrack.id) {
            this.trackNumber = trackId;
            this.readTrackInfo();
          }

          if(len === 0) {
            len = this.cmd[8];
          } else {
            len = 0x80 << len;
          }

          for(; sector <= sectorLast; ++sector) {
            //console.log('Read sector ' + this.currentTrack.sector[sector].id+ ' ' + len + ' bytes');

            let data = this.readSector(sector);
            for(let b=0; b < len; ++b) {
              this.dataIo.push(data[b]);
            }
          }

          this.icCode = 0;
          this.reportStatus0(0, 0, false, false, 0);
          this.results.push(this.currentTrack.sector[sectorLast].fdcStatus1);
          this.results.push(this.currentTrack.sector[sectorLast].fdcStatus2);
          this.results.push(this.currentTrack.sector[sectorLast].track);
          this.results.push(0);
          this.results.push(this.currentTrack.sector[sectorLast].id);
          this.results.push(this.currentTrack.sector[sectorLast].size);
        } else {
          this.icCode = 2;
          this.reportStatus0(this.currentUnit, this.currentHead, false, false, 2);
        }
        break;

      case 0x07:
        //We are a virtual drive! Recalibration is instant 8)
        this.busyFlag = true;
        this.trackNumberRequested = 0;
        this.icCode = 0;
        this.seekDelay = 1;
        break;

      case 0x08:
        /*if(this.seekDelay) {
          this.reportStatus0(0, 0, false, false, this.icCode);
          this.results.push(this.trackNumber);
        } else {*/
          //this.busyFlag = false;
        if(this.icCode === NaN) {
          this.reportStatus0(this.currentUnit, this.currentHead, true, false, 11);
          this.icCode = NaN;
        } else {
          if(this.currentUnit === 0 && this.currentHead === 0) {
            this.trackNumber = this.trackNumberRequested;

            this.reportStatus0(0, 0, false, !this.busyFlag, this.icCode);
            this.results.push(this.trackNumber);
          } else {
            this.reportStatus0(this.currentUnit, this.currentHead, true, false, this.icCode);
            this.results.push(this.trackNumber);
          }
        }
        //}
        break;

      case 0x0F:
        this.currentUnit = this.cmd[1] & 0x3;
        this.currentHead = this.cmd[1] & 0x4 >> 2;

        if(this.currentUnit === 0 && this.currentHead === 0) {
          this.busyFlag = true;
          this.seekDelay = 1;
          if(this.cmd[2] >= this.tracks) {
            this.icCode = 11;
          } else {
            this.icCode = 0;
            this.trackNumberRequested = this.cmd[2];
          }
        }
        break;

      case 0x0A:
        this.busyFlag = true;
        this.seekDelay = 1;
        this.readTrackInfo();

        this.reportStatus0(0, 0, false, true, 0);
        this.results.push(this.currentTrack.sector[0].fdcStatus1);
        this.results.push(this.currentTrack.sector[0].fdcStatus2);
        this.results.push(this.currentTrack.sector[0].track);
        this.results.push(0);
        this.results.push(this.currentTrack.sector[0].id);
        this.results.push(this.currentTrack.sector[0].size);
        break;

      default: 
        this.icCode = 2;
        console.log('CMD: ' + (cmdByte & 0x1F).toString(16)+ ' Not implemented!');
        break;
    }

    this.updateStatus();
  }

  private updateStatus() {
    let statusFlags = 0x0;
    statusFlags |= this.busyFlag ? 0x01 : 0;
    statusFlags |= this.fdcBusy ? 0x10 : 0;
    statusFlags |= this.executionFlag ? 0x20 : 0;
    statusFlags |= this.outputFlag ? 0x40 : 0;
    statusFlags |= this.requestFlag ? 0x80 : 0;

    this.statusIo.value = statusFlags;
    //console.log({busy: this.busyFlag, fdcBusy: this.fdcBusy, exec: this.executionFlag, out: this.outputFlag, req: this.requestFlag });
  }

  public loadDisc(path: string): boolean {
    let fd = fs.openSync(path, 'r');
    let dskHeader = new Buffer(0xFF);
    fs.readSync(fd, dskHeader, 0, 0xFF, 0);
    console.log(dskHeader.toString('UTF-8', 0, 34));
    switch(dskHeader.toString('UTF-8', 0, 2)) {
      case 'MV':
        this.extFromat = false;
        console.log('Detected dsk format!');

        this.tracks = dskHeader.readUInt8(0x30);
        this.sides = dskHeader.readUInt8(0x31);
        this.trackSize = dskHeader.readUInt16LE(0x32);

        console.log('Tracks: ' + this.tracks + ' á ' + this.trackSize + ' bytes');
        break;

      case 'EX':
        this.extFromat = true;
        console.log('Detected extendet dsk format!');
        break;

      default:
        fs.closeSync(fd);
        console.warn('Unknown disk format!');
        return false;
    }

    this.diskFile = fd;

    return true;
  }
  
  private reportStatus0(unit: number, head: number, notReady: boolean, seekEnd: boolean, icCode: number) {
    let status = 0;
    status |= unit & 0x3;
    status |= (head & 0x1) << 2;
    if(unit !== 0 || head !== 0) {
      status |= notReady ? 0x8 : 0x0;
      status |= 0x10;
      status |= seekEnd ? 0x20 : 0x0;
      status |= (2) << 6;
    } else {
      status |= notReady ? 0x8 : 0x0;
      status |= seekEnd ? 0x20 : 0x0;
      status |= (icCode & 0x03) << 6;
    }

    //console.log({ unit: unit, head: head, notReady: notReady, seekEnd: seekEnd, icCode: icCode});

    this.results.push(status);
  }

  public motorPort(): IoPort {
    return this.motorIo.writeonly;
  }
  
  public statusPort(): IoPort {
    return this.statusIo.readonly;
  }
  
  public commandPort(): IoPort {
    return this.commandIo;
  }

  private transferResult() {
    if(this.transferring) {
      this.requestFlag = false;
      this.updateStatus();

      this.transferring = false;

      this.commandIo.value = 0;
      //this.checkTransferFinished();
    }
  }

  private checkTransferFinished() {
    if(this.results.length === 0) {
      //console.log('RDY');

      this.fdcBusy = false;
      this.busyFlag = false;
      this.outputFlag = false;
      this.executionFlag = false;
      this.requestFlag = true;
      this.updateStatus();

      this.transferring = false;
    }
  }

  public tick() {
    if(this.executionFlag) {
      if(this.seekDelay) {
        //console.log('SEEKING');
        this.seekDelay--;
      } else {
        if(this.dataIo.length > 0) {
          if(!this.transferring) {
            this.outputFlag = true;
            this.requestFlag = true;

            this.commandIo.value = this.dataIo[0];
            this.dataIo = this.dataIo.slice(1);
            this.transferring = true;

            this.updateStatus();
          }
        } else if(!this.transferring) {
          this.busyFlag = false;
          this.executionFlag = false;
          this.requestFlag = false;
          this.updateStatus();
        }
      }
    } else if(this.fdcBusy && this.cmd.length === 0) {
      if(!this.transferring) {
        if(this.results.length) {
          this.outputFlag = true;
          this.requestFlag = true;

          //console.log('TX ' + this.results[0].toString(16));

          this.commandIo.value = this.results[0];
          this.results = this.results.slice(1);
          this.transferring = true;

          this.updateStatus();
        } else {
          this.checkTransferFinished();
        }
      }
    }
  }
}