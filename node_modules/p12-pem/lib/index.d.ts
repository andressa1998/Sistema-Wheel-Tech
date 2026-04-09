export declare const Name: (name: string) => string;
export declare function getPemFromP12(certPath: string, password: string): {
    pemKey: string;
    pemCertificate: string;
    commonName: any;
};
