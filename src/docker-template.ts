export function generateDockerTemplate(config: any) {
  return `version: '3.3'
services:
  db:
    image: mysql:5.7
    volumes:
      - ${config.mysql.sql_volume}:/var/lib/mysql
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: ${config.mysql.root_password}
      MYSQL_DATABASE: ${config.mysql.database}
      MYSQL_USER: ${config.mysql.user}
      MYSQL_PASSWORD: ${config.mysql.password}

  wordpress:
    depends_on:
      - db
    image: wordpress:latest
    volumes:
      - ./${config.wordpress.output_directory}:/var/www/html
    ports:
      - '${config.wordpress.port}:80'
    restart: always
    environment:
      WORDPRESS_DB_HOST: db:3306
      WORDPRESS_DB_USER: ${config.mysql.user}
      WORDPRESS_DB_PASSWORD: ${config.mysql.password}
      WORDPRESS_DB_NAME: ${config.mysql.database}
volumes:
  ${config.mysql.sql_volume}: {}
`
}
