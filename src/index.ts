import fs from 'fs'
import ini from 'ini'
import YAML from 'yaml'
import { exec, spawn } from 'child_process'
// @ts-ignore
import commandLineArgs from 'command-line-args'
import { configTemplate } from './config-template'
import { generateDockerTemplate } from './docker-template'

let optionDefinitions = [
  { name: 'config', alias: 'c', type: String },
  { name: 'force-reconfig', alias: 'f', type: Boolean },
  { name: 'run', alias: 'r', type: Boolean },
  { name: 'backup-sql', alias: 'b', type: Boolean },
  { name: 'set-debug', alias: 'd', type: Number },
]
let options = commandLineArgs(optionDefinitions)

let DOCKER_CONFIG_FILENAME = './docker-compose.yml'

// Generate yaml config
if (!fs.existsSync(DOCKER_CONFIG_FILENAME) || options['force-reconfig']) {
  console.log('Generating ', DOCKER_CONFIG_FILENAME)
  let defaultConfigName = options['config'] || 'config.ini'
  let configString = null

  try {
    configString = fs.readFileSync(defaultConfigName, 'utf-8')
  } catch (e) {
    configString = configTemplate
  }

  let defaultConfig = ini.parse(configTemplate)

  let config = ini.parse(configString)

  if (!config.wordpress) {
    config.wordpress = defaultConfig.wordpress
  }

  Object.entries(defaultConfig.wordpress).forEach(([a, b]) => {
    if (!config.wordpress[a]) {
      config.wordpress[a] = b
    }
  })

  if (!config.mysql) {
    config.mysql = defaultConfig.mysql
  }

  Object.entries(defaultConfig.mysql).forEach(([a, b]) => {
    if (!config.mysql[a]) {
      config.mysql[a] = b
    }
  })

  let templateYml = generateDockerTemplate(config)
  fs.writeFileSync(DOCKER_CONFIG_FILENAME, templateYml)
}

// Load yaml config
let dockerComposeConfig = YAML.parse(
  fs.readFileSync(DOCKER_CONFIG_FILENAME, 'utf8')
)

function runCommand(...args: [string, string[]]) {
  let cmd = spawn(args[0], args[1])

  cmd.stdout.on('data', function (data) {
    console.log('stdout: ' + data.toString())
  })

  cmd.stderr.on('data', function (data) {
    console.log('stderr: ' + data.toString())
  })

  cmd.on('exit', function (code) {
    if (!code) {
      return
    }
    console.log('child process exited with code ' + code.toString())
  })
}

if (options['run']) {
  runCommand('docker-compose', ['up'])
}

if (options['backup-sql']) {
  exec(
    `docker-compose exec -T db /usr/bin/mysqldump -u root --password=${dockerComposeConfig.services.db.environment.MYSQL_ROOT_PASSWORD} ${dockerComposeConfig.services.db.environment.MYSQL_DATABASE}`,
    function (error, stdout, stderr) {
      if (error) {
        console.log(error.stack)
        console.log('Error code: ' + error.code)
        console.log('Signal received: ' + error.signal)
      }
      fs.writeFileSync('./backup.sql', stdout)
      console.error(stderr)
    }
  )
}

if (options['set-debug'] === 0 || options['set-debug'] === 1) {
  console.log('Setting debug')
  let dir = dockerComposeConfig.services.wordpress.volumes[0].split(':')[0]
  let file = dir + '/wp-config.php'

  let fileContents = fs.readFileSync(file, 'utf8').split('\n')
  fileContents = fileContents.filter((x) => !x.startsWith(`define( 'WP_DEBUG`))
  let index =
    fileContents.indexOf(
      ' * @link https://wordpress.org/support/article/debugging-in-wordpress/'
    ) + 2

  if (options['set-debug'] === 1) {
    fileContents = [
      ...fileContents.slice(0, index),
      `define( 'WP_DEBUG', true );`,
      `define( 'WP_DEBUG_LOG', '/var/www/html/wp-errors.log' );`,
      ...fileContents.slice(index, fileContents.length),
    ]
  } else {
    fileContents = [
      ...fileContents.slice(0, index),
      `define( 'WP_DEBUG', false );`,
      ...fileContents.slice(index, fileContents.length),
    ]
  }

  fs.writeFileSync(
    file,
    fileContents.reduce((a, b) => a + '\n' + b)
  )

  if (options['set-debug'] === 1) {
    let logFilename = dir + '/wp-errors.log'
    fs.writeFileSync(logFilename, '')
    console.log('watching ' + logFilename)
    let watcher = fs.watch(logFilename)
    let oldStuff = ''
    watcher.on('change', (ev, filename) => {
      let newStuff = fs.readFileSync(dir + '/' + filename, 'utf8')
      let splitted = newStuff.replace(oldStuff, '').split('\n')
      splitted = splitted.slice(0, splitted.length - 1)
      console.log(splitted.reduce((a, b) => a + '\n' + b))
      oldStuff = newStuff
    })
  }
}
