const fs = require('node:fs');
const path = require('node:path');

class BughuntReporter {
  constructor() {
    this.failures = [];
  }

  onTestEnd(test, result) {
    if (!['failed', 'timedOut'].includes(result.status)) return;
    const error = result.errors?.[0];
    this.failures.push({
      title: test.titlePath().join(' > '),
      status: result.status,
      message: String(error?.message || 'Falha sem mensagem').slice(0, 4000)
    });
  }

  onEnd() {
    const reportPath = path.join(process.cwd(), 'reports', 'bughunt-report.md');
    if (!this.failures.length) {
      if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
      return;
    }
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const body = [
      '# Night City Bughunt Report',
      '',
      `Gerado em: ${new Date().toISOString()}`,
      '',
      ...this.failures.flatMap((failure, index) => [
        `## ${index + 1}. ${failure.title}`,
        '',
        `Status: ${failure.status}`,
        '',
        '```',
        failure.message,
        '```',
        ''
      ])
    ].join('\n');
    fs.writeFileSync(reportPath, body, 'utf8');
  }
}

module.exports = BughuntReporter;
