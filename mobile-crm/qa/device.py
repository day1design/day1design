"""ADB helpers restricted to this task's dedicated emulator, never a handset."""
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ADB = Path('C:/Users/flame/AppData/Local/Android/Sdk/platform-tools/adb.exe')
SERIAL = 'emulator-5582'
EVIDENCE = ROOT / '.tools' / 'qa'
EVIDENCE.mkdir(parents=True, exist_ok=True)

def adb(*args, binary=False):
    result = subprocess.run([str(ADB), '-s', SERIAL, *args], capture_output=True, check=True, timeout=35)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace')

def verify_device():
    name = adb('emu', 'avd', 'name')
    if 'polarad_crm_dev' not in name.splitlines():
        raise RuntimeError('Refusing to operate a different AVD')

def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/crm-qa.xml')
    return ET.fromstring(adb('shell', 'cat', '/sdcard/crm-qa.xml')).findall('.//node')

def tap_text(text, contains=False):
    for n in nodes():
        value = n.get('text', '')
        if value == text or (contains and text in value):
            xy = list(map(int, re.findall(r'\d+', n.get('bounds', ''))))
            if len(xy) == 4:
                adb('shell', 'input', 'tap', str((xy[0]+xy[2])//2), str((xy[1]+xy[3])//2))
                return
    raise AssertionError('Visible control not found: ' + text)

def fill(text, index=0):
    fields = [n for n in nodes() if n.get('class') == 'android.widget.EditText']
    xy = list(map(int, re.findall(r'\d+', fields[index].get('bounds', ''))))
    adb('shell', 'input', 'tap', str((xy[0]+xy[2])//2), str((xy[1]+xy[3])//2))
    adb('shell', 'input', 'keyevent', 'KEYCODE_MOVE_END')
    adb('shell', 'input', 'keyevent', *(['67'] * (len(fields[index].get('text', '')) + 2)))
    adb('shell', 'input', 'text', text.replace(' ', '%s'))
    adb('shell', 'input', 'keyevent', '4')

def wait_text(text, timeout=25):
    end = time.monotonic()+timeout
    while time.monotonic()<end:
        if any(text in n.get('text', '') for n in nodes()):
            return
        time.sleep(.5)
    raise AssertionError('UI did not show: '+text)

def screenshot(name):
    path = EVIDENCE / (name+'.png')
    path.write_bytes(adb('exec-out', 'screencap', '-p', binary=True))
    return path

if __name__ == '__main__':
    verify_device()
    print('Dedicated CRM emulator verified')

def scroll_to(text, contains=False, attempts=12):
    for _ in range(attempts):
        if any((n.get('text','') == text or (contains and text in n.get('text',''))) for n in nodes()):
            tap_text(text, contains)
            return
        adb('shell','input','swipe','540','1900','540','650','350')
        time.sleep(.2)
    raise AssertionError('Control not found after scrolling: '+text)
