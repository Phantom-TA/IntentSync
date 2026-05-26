import chalk from 'chalk';

export function printSuccess(message: string): void {
  console.log(chalk.green('✓') + ' ' + message);
}

export function printError(message: string): void {
  console.error(chalk.red('✗') + ' ' + chalk.red(message));
}

export function printWarning(message: string): void {
  console.warn(chalk.yellow('⚠') + ' ' + chalk.yellow(message));
}

export function printInfo(message: string): void {
  console.log(chalk.cyan('ℹ') + ' ' + message);
}

export function printDivider(): void {
  console.log(chalk.gray('─'.repeat(60)));
}

export function printHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(title));
  printDivider();
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printKeyValue(key: string, value: string): void {
  console.log(`  ${chalk.gray(key.padEnd(20))} ${value}`);
}
