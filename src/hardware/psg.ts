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
export class Psg {
  private context = new AudioContext();
  private channel: GainNode[];
  private tone: OscillatorNode[];
  private channelState: boolean[] = [false, false, false, false];
  private currentRegister: number;
  private register: Buffer;
  private keyboarMatrix: Uint8Array = new Uint8Array(10);
  private keyboardRow: number = 0;
  private altKey: boolean = false;
  private keyOverride = {};
  
  private keyboardMapping = {
    "Enter":      [0x40, 6],
    "F3":         [0x40, 5],
    "F6":         [0x40, 4],
    "F9":         [0x40, 3],
    "ArrowDown":  [0x40, 2],
    "ArrowRight": [0x40, 1],
    "ArrowUp":    [0x40, 0],
    "F12":        [0x41, 7],  //Normal Keyboards don't have F0
    "F2":         [0x41, 6],
    "F1":         [0x41, 5],
    "F5":         [0x41, 4],
    "F8":         [0x41, 3],
    "F7":         [0x41, 2],
    "Undefined":  [0x41, 1], //TODO Copy Key 
    "ArrowLeft":  [0x41, 0],
    "Control":    [0x42, 7],
    "\\":         [0x42, 6],
    "ShiftLeft":  [0x42, 5],
    "ShiftRight": [0x42, 5],
    "F4":         [0x42, 4],
    "]":          [0x42, 3],
    "Return":     [0x42, 2],
    "[":          [0x42, 1],
    "Del":        [0x42, 0],
    "Period":     [0x43, 7],
    "/":          [0x43, 6],
    ":":          [0x43, 5],
    "Semicolon":  [0x43, 4],
    "KeyP":       [0x43, 3],
    "@":          [0x43, 2],
    "Minus":      [0x43, 1],
    "^":          [0x43, 0],
    ",":          [0x44, 7],
    "KeyM":       [0x44, 6],
    "KeyK":       [0x44, 5],
    "KeyL":       [0x44, 4],
    "KeyI":       [0x44, 3],
    "KeyO":       [0x44, 2],
    "Digit9":     [0x44, 1],
    "Digit0":     [0x44, 0],
    "Space":      [0x45, 7],
    "KeyN":       [0x45, 6],
    "KeyJ":       [0x45, 5],
    "KeyH":       [0x45, 4],
    "KeyY":       [0x45, 3],
    "KeyU":       [0x45, 2],
    "Digit7":     [0x45, 1],
    "Digit8":     [0x45, 0],
    "KeyV":       [0x46, 7],
    "KeyB":       [0x46, 6],
    "KeyF":       [0x46, 5],
    "KeyG":       [0x46, 4],
    "KeyT":       [0x46, 3],
    "KeyR":       [0x46, 2],
    "Digit5":     [0x46, 1],
    "Digit6":     [0x46, 0],
    "KeyX":       [0x47, 7],
    "KeyC":       [0x47, 6],
    "KeyD":       [0x47, 5],
    "KeyS":       [0x47, 4],
    "KeyW":       [0x47, 3],
    "KeyE":       [0x47, 2],
    "Digit3":     [0x47, 1],
    "Digit4":     [0x47, 0],
    "KeyZ":       [0x48, 7],
    "Capslock":   [0x48, 6],
    "KeyA":       [0x48, 5],
    "Tab":        [0x48, 4],
    "KeyQ":       [0x48, 3],
    "Escape":     [0x48, 2],
    "Digit2":     [0x48, 1],
    "Digit1":     [0x48, 0],
    "Backspace":  [0x49, 7]
  }
  
  constructor() {
    this.tone = [
      this.context.createOscillator(),
      this.context.createOscillator(),
      this.context.createOscillator()
    ];

    this.channel = [
      this.context.createGain(),
      this.context.createGain(),
      this.context.createGain()
    ];

    this.initOscillator(this.tone[0]);
    this.initOscillator(this.tone[1]);
    this.initOscillator(this.tone[2]);

    this.channel[0].connect(this.context.destination);
    this.channel[1].connect(this.context.destination);
    this.channel[2].connect(this.context.destination);

    this.register = new Buffer(16); 
    this.register[0xE] = 0xFF;
    
    this.keyboarMatrix.fill(0xFF);
  }

  private initOscillator(oscillator: OscillatorNode) {
    oscillator.type = 'square';
    oscillator.start();
  }
  
  public selectRegister(reg: number) {
    this.currentRegister = reg;
  }
  
  public selectKeyboardRow(row: number) {
    this.keyboardRow = row;
    this.register[0xE] = this.keyboarMatrix[row];
  }
  
  public read(): number {
    return this.register[this.currentRegister];
  }

  private updateFrequency(channel: number, hi: number, lo: number) {
    let val = (hi << 8) | lo;
    if(!val) { val = 1 };
    let freq = (4 * 1000 * 1000) / 64 / val;
    this.tone[channel].frequency.value = freq;
  }

  private toggleTone(channel: number, toggle: boolean) {
    if(toggle) {
      this.tone[channel].connect(this.channel[channel]);
    } else {
      this.tone[channel].disconnect();
    }
  }

  private updateVolume(channel: number, vol: number) {
    if((vol & 0x0F) === 0) {
      this.channel[channel].gain.value = 0;
    } else {
      let amp = 10 / Math.pow(Math.sqrt(2), (15 - (vol & 0x0F)));
      this.channel[channel].gain.value = amp;
    }
  }
  
  public write(val: number) {
    this.register[this.currentRegister] = val;

    switch(this.currentRegister) {
      case 0x00:
      case 0x01:
        this.updateFrequency(0, this.register[0x01], this.register[0x00]);
        break;

      case 0x02:
      case 0x03:
        this.updateFrequency(1, this.register[0x03], this.register[0x02]);
        break;

      case 0x04:
      case 0x05:
        this.updateFrequency(2, this.register[0x05], this.register[0x04]);
        break;

      case 0x07:
        let mix = this.register[0x07];
        if(((mix & 0x1) === 0) !== this.channelState[0]) { this.toggleTone(0, (mix & 0x1) === 0); }
        if(((mix & 0x2) === 0) !== this.channelState[1]) { this.toggleTone(1, (mix & 0x2) === 0); }
        if(((mix & 0x4) === 0) !== this.channelState[2]) { this.toggleTone(2, (mix & 0x4) === 0); }

        this.channelState[0] = (mix & 0x1) === 0;
        this.channelState[1] = (mix & 0x2) === 0;
        this.channelState[2] = (mix & 0x4) === 0;
        this.channelState[3] = (mix & 0x8) === 0;
        break;

      case 0x08:
        this.updateVolume(0, this.register[0x08]);
        break;

      case 0x09:
        this.updateVolume(1, this.register[0x09]);
        break;

      case 0x0A:
        this.updateVolume(2, this.register[0x0A]);
        break;
    }
  }
  
  private keyIndex(keyCode: string): number[] {
    if(this.keyboardMapping.hasOwnProperty(keyCode)) {
      return this.keyboardMapping[keyCode];
    } else {
      return [0, 0];
    }
  }
  
  private keyDownEvent(e: KeyboardEvent) { 
    let code = e['code'];

    if(code === 'AltRight' || code === 'AltLeft') {
      this.altKey = true;
      e.preventDefault();
      return;
    }

    if(this.altKey) {
      switch(code) {
        case 'KeyQ':
          code = '@';
          this.keyOverride[e['code']] = code; 
          break;
      }
    }

    let mapping = this.keyIndex(code);
    if(mapping[0] === 0) { 
      console.log("Unhandled Key:", e['code']);   
      return; 
    }
    
    let mask = ~((0x1 << mapping[1]) & 0xFF);
    this.keyboarMatrix[mapping[0] - 0x40] &= mask;
    
    //this.register[0xE] = this.keyboarMatrix[this.keyboardRow];
    
    e.preventDefault();
  }
  
  private keyUpEvent(e: KeyboardEvent) {
    let code = e['code'];

    if(code === 'AltRight' || code === 'AltLeft') {
      this.altKey = false;
      e.preventDefault();
      return;
    }

    if(this.keyOverride.hasOwnProperty(code)) {
      code = this.keyOverride[code];
      this.keyOverride[code] = undefined;
    }

    let mapping = this.keyIndex(code);
    if(mapping[0] === 0) { return; }
    
    let mask = (0x1 << mapping[1]) & 0xFF;
    this.keyboarMatrix[mapping[0] - 0x40] |= mask;
    
    //this.register[0xE] = this.keyboarMatrix[this.keyboardRow];
    
    e.preventDefault();  
  }
  
  public handleKeyEvent(e: KeyboardEvent) {
    switch(e.type) {
      case 'keyup': return this.keyUpEvent(e);
      case 'keydown': return this.keyDownEvent(e);
      default:
        console.log('Unhandled event', e);
        return;
    }
  }
}