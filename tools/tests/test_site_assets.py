"""Checks the self-contained GitHub Pages site and its local shared assets."""
import hashlib
import json
import re
import struct
import unittest
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / 'site'


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.references = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if values.get('id'):
            self.ids.append(values['id'])
        for name in ('href', 'src'):
            if values.get(name):
                self.references.append(values[name])


class SiteAssets(unittest.TestCase):
    def test_references_and_unique_ids(self):
        for page in ('index.html', 'downloads.html', 'guide.html', 'privacy.html', '404.html'):
            parser = References()
            parser.feed((SITE / page).read_text(encoding='utf-8'))
            self.assertEqual(len(parser.ids), len(set(parser.ids)), page)
            for ref in parser.references:
                parts = urlsplit(ref)
                if parts.scheme or parts.netloc:
                    continue
                if not parts.path and parts.fragment:
                    self.assertIn(parts.fragment, parser.ids, f'{page}:{ref}')
                    continue
                if not parts.path or parts.path in ('.', './'):
                    continue
                self.assertTrue((SITE / parts.path).is_file(), f'{page}:{ref}')
                if parts.path.endswith('icons.svg') and parts.fragment:
                    tree = ET.parse(SITE / parts.path)
                    self.assertIn(parts.fragment, {e.get('id') for e in tree.iter()}, f'{page}:{ref}')
        css = (SITE / 'style.css').read_text(encoding='utf-8')
        for path in re.findall(r"url\(['\"]?([^)'\"]+)", css):
            self.assertTrue((SITE / path).is_file(), path)

    def test_fonts_flags_and_protocol_icons_match_app(self):
        for group in ('flags', 'protocols'):
            for src in (ROOT / 'apps/shared/assets' / group).glob('*'):
                if not src.is_file() or src.suffix not in ('.png', '.svg'):
                    continue
                target = SITE / 'assets' / group / src.name
                self.assertTrue(target.is_file(), str(target))
                self.assertEqual(
                    hashlib.sha256(src.read_bytes()).digest(),
                    hashlib.sha256(target.read_bytes()).digest(),
                    src.name,
                )
        for src in (SITE / 'assets/fonts').glob('*.ttf'):
            self.assertEqual(src.read_bytes(), (ROOT / 'apps/shared/fonts' / src.name).read_bytes())
        self.assertTrue((SITE / 'assets/fonts/OFL.txt').is_file())
        self.assertTrue((SITE / 'assets/flags/ATTRIBUTION.md').is_file())

    def test_manifest_icons_and_sizes(self):
        manifest = json.loads((SITE / 'site.webmanifest').read_text())
        for icon in manifest['icons']:
            data = (SITE / icon['src']).read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            width, height = struct.unpack('>II', data[16:24])
            self.assertEqual(icon['sizes'], f'{width}x{height}')

    def test_readme_logo(self):
        self.assertIn('branding/oryvexcore-256.png', (ROOT / 'README.md').read_text())
        self.assertTrue((ROOT / 'branding/oryvexcore-256.png').is_file())

    def test_screenrecord_removed_and_interactive_preview_bundled(self):
        readme = (ROOT / 'README.md').read_text(encoding='utf-8')
        home = (SITE / 'index.html').read_text(encoding='utf-8')
        guide = (SITE / 'guide.html').read_text(encoding='utf-8')
        preview_html = (SITE / 'preview/index.html').read_text(encoding='utf-8')
        preview_js = (SITE / 'preview/preview.js').read_text(encoding='utf-8')
        self.assertFalse((SITE / 'video').exists())
        self.assertFalse((SITE / 'video-player.js').exists())
        self.assertNotIn('<video', readme)
        self.assertNotIn('oryvexvpn-preview.mp4', readme)
        self.assertNotIn('video-player.js', home)
        self.assertNotIn('<video', home)
        self.assertNotIn('oryvexvpn-preview.mp4', home)
        self.assertNotIn('Watch the full preview video', guide)
        self.assertTrue((SITE / 'preview/index.html').is_file())
        self.assertTrue((SITE / 'preview/preview.css').is_file())
        self.assertTrue((SITE / 'preview/preview.js').is_file())
        for expected_id in (
            'card-download',
            'card-upload',
            'card-session',
            'card-gateway',
            'connected-country-badge',
            'fox-account-modal',
        ):
            self.assertIn(expected_id, preview_html)
        self.assertIn('Account Required for Fox', preview_html)
        self.assertIn('showFoxAccountModal', preview_js)


if __name__ == '__main__':
    unittest.main()
