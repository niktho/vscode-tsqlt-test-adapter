import { ColumnValue, Connection, ConnectionConfig, Request } from 'tedious';

function getValue<T extends Record<string, any>>(previous: T, current: any): T {
    const columnName = Boolean(current.metadata.colName) ? current.metadata.colName : 'value';
    return Object.assign({
        [columnName]: current.value
    } as T, previous);
}

function getColumnsAsObject<T extends Record<string, any>>(columns: ColumnValue[]): T {
    return columns.reduce<T>(
        (previous, current) => getValue(previous, current), {} as T);
}

export async function executeSql<T extends Record<string, any>>(query: string, connectionConfiguration: ConnectionConfig): Promise<T[]> {
    const sqlConnection = new Connection(connectionConfiguration);

    return new Promise((resolve, reject) => {
        let queryResult: T[] = [];

        const request = new Request(query, (err) => {
            if (err) {
                reject(err);
            }
            resolve(queryResult);
        });

        request.on('row', (columns) => {
            queryResult.push(
                getColumnsAsObject<T>(columns)
            );
        });

        sqlConnection.on('connect', err => {
            if (err) {
                reject(err);
            } else {
                sqlConnection.execSql(request);
            }
        });

        sqlConnection.connect();
    });
}