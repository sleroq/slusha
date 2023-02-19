import Werror from "./lib/werror.ts";

const API = 'http://localhost:3000/api/';

interface apiResponse {
    error: string;
    data: string;
}

export default async function ask(question: string): Promise<string> {
    const url = new URL(API);
    const params = new URLSearchParams();
    params.set('q', question);
    url.search = params.toString();

    let res;
    try {
        res = await fetch(url);
    } catch (err) {
        throw new Werror(err, 'Fetching response from api');
    }

    let data: apiResponse;
    try {
        data = await res.json();
    } catch (err) {
        throw new Werror(err, 'Parsing data');
    }

    if (data.error) {
        // TODO: This is not, how it should be
        return data.error;
    }

    return data.data;
}