import collections
import contextlib
import importlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class ScraperOutputTests(unittest.TestCase):
    def setUp(self):
        self.previous_directory = Path.cwd()
        self.temp = tempfile.TemporaryDirectory()
        os.chdir(self.temp.name)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(os.chdir, self.previous_directory)
        self.sample = json.loads((ROOT / 'public/example-papers.json').read_text())
        self.papers = self.sample['papers']
        self.counts = collections.Counter(self.sample['subjects_counter'])

    def save(self, module):
        with contextlib.redirect_stdout(io.StringIO()):
            module.save_to_markdown_and_json(self.papers, self.counts, '2026-04-27')

    def test_monthly_outputs_and_relative_index(self):
        for name in ('fetch_arxiv', 'fetch_arxiv_list'):
            with self.subTest(name=name), tempfile.TemporaryDirectory(dir='.') as directory:
                with change_directory(directory):
                    module = importlib.import_module(name)
                    self.save(module)
                    path = Path('public/archive/202604/RAVEN_20260427.json')
                    data = json.loads(path.read_text())
                    self.assertEqual(data['papers'], self.papers)
                    self.assertEqual(data['total'], 3)
                    self.assertTrue(Path('public/archive/202604/astroph_2026-04-27.md').is_file())
                    self.assertEqual(json.loads(Path('public/latest.json').read_text()),
                                     {'latest_file': 'archive/202604/RAVEN_20260427.json'})
                    path.write_text('{"personal-note":"keep this"}')
                    before = {p: p.read_bytes() for p in Path('public').rglob('*') if p.is_file()}
                    self.save(module)
                    self.assertEqual(before, {p: p.read_bytes() for p in Path('public').rglob('*') if p.is_file()})

    def test_existing_legacy_or_partial_output_is_preserved(self):
        for name in ('fetch_arxiv', 'fetch_arxiv_list'):
            for filename in ('astroph_2026-04-27.md', 'public/RAVEN_20260427.json',
                             'public/archive/202604/astroph_2026-04-27.md',
                             'public/archive/202604/RAVEN_20260427.json'):
                with self.subTest(name=name, filename=filename), tempfile.TemporaryDirectory(dir='.') as directory:
                    with change_directory(directory):
                        path = Path(filename)
                        path.parent.mkdir(parents=True, exist_ok=True)
                        path.write_text('keep existing contents')
                        self.save(importlib.import_module(name))
                        self.assertEqual(path.read_text(), 'keep existing contents')
                        self.assertEqual([p for p in Path('.').rglob('*') if p.is_file()], [path])

    def test_empty_result_does_not_create_outputs(self):
        for name in ('fetch_arxiv', 'fetch_arxiv_list'):
            with contextlib.redirect_stdout(io.StringIO()):
                importlib.import_module(name).save_to_markdown_and_json([], collections.Counter(), None)
        self.assertEqual(list(Path('.').iterdir()), [])

    def test_cli_skips_existing_day_before_network(self):
        module = importlib.import_module('fetch_arxiv_list')
        Path('astroph_2026-04-27.md').write_text('keep')
        with patch('sys.argv', ['fetch_arxiv_list.py', '--date', '20260427']), \
                patch.object(module, 'fetch_latest_from_list') as fetch, \
                contextlib.redirect_stdout(io.StringIO()):
            module.main()
        fetch.assert_not_called()

    def test_date_validation(self):
        for name in ('fetch_arxiv', 'fetch_arxiv_list'):
            module = importlib.import_module(name)
            self.assertEqual(module.parse_cli_date_yyyymmdd('20260427'), '2026-04-27')
            self.assertIsNone(module.parse_cli_date_yyyymmdd('20260230'))
            self.assertIsNone(module.parse_cli_date_yyyymmdd('2026-04-27'))


@contextlib.contextmanager
def change_directory(directory):
    previous = Path.cwd()
    os.chdir(directory)
    try:
        yield
    finally:
        os.chdir(previous)


if __name__ == '__main__':
    unittest.main()
