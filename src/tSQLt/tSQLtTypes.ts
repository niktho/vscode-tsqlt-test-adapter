// eslint-disable-next-line @typescript-eslint/naming-convention
export interface tSQLt {
    [key: string]: string | number
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface tSQLtTestClass extends tSQLt {
    schemaId: number
    name: string
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface tSQLtTests extends tSQLt {
    schemaId: number,
    testClassName: string,
    objectId: number,
    name: string
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface tSQLtResult extends tSQLt {
    value: string
}