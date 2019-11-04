import { Request, Response } from "express";
import fetch = require("node-fetch");
import { GeoFragmenter } from "../fragmenters/GeoFragmenter";
import GeohashFragmenter from "../fragmenters/geohash";
import H3Fragmenter from "../fragmenters/h3";
import SlippyFragmenter from "../fragmenters/slippy";

// tslint:disable: no-string-literal

const BASE_URI = "http://localhost:3001";
const N = 100; // number of observations to fetch

function wrapLatest(
    req: Request, // the original request
    data: object, // the converted data
    time: Date, // when was this known to be the latest data
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
    // figure out which area this fragment covers
    const focus = geoFragmenter.getFocusPoint(req);
    const precision = geoFragmenter.getPrecision(req);

    // adapt/use a new json-ld context
    const vocabulary = extractVocubalary(data);
    expandVocabulary(vocabulary);
    simplifyGraph(vocabulary, data);

    // build the fragment
    const result = {
        "@context": vocabulary,
        "@id": geoFragmenter.getLatestFragmentURI(BASE_URI, focus, precision),
        "schema:endDate": time.toISOString(),
        ...geoFragmenter.getMetaData(focus, precision),
        "dcterms:isPartOf": {
            "@id": BASE_URI,
            "@type": "hydra:Collection",
            "hydra:search": geoFragmenter.getLatestearchTemplate(BASE_URI),
        },
        "@graph": data,
    };

    return result;
}

async function getLatest(
    req: Request, // the original request
    res: Response, // the response object
    geoFragmenter: GeoFragmenter, // geospatial fragmentation strategy
) {
    // check if we want to support this level of granularity
    const precision = geoFragmenter.getPrecision(req);
    const {
        minimum: minimumPrecision,
        maximum: maximumPrecision,
    } = geoFragmenter.getPrecisionRange();

    if (precision < minimumPrecision || precision > maximumPrecision) {
        res.status(404).send();
        return;
    }

    // going to fetch the most recent observations up until NOW
    const toTime = new Date();

    // figure out which area to request data for
    // Polygon in geojson format
    const focus = geoFragmenter.getFocusPoint(req);
    const bbox = [geoFragmenter.getBBox(focus, precision).map((location) => [location.longitude, location.latitude])];

    const uri = "http://localhost:3000/temporal/entities?georel=within&geometry=Polygon&"
        + `coordinates=${JSON.stringify(bbox)}&timerel=before`
        + `&time=${toTime.toISOString()}&lastN=${N}`;
    const response = await fetch(uri);
    const data = await response.json();

    // add metadata to the resulting data
    const wrappedData = wrapLatest(req, data, toTime, geoFragmenter);

    addHeaders(res);
    res.status(200).send(wrappedData);
}

function addHeaders(
    res: Response, // response object to write the headers to
) {
    res.type("application/ld+json; charset=utf-8");
    res.set("Cache-Control", "public, max-age=5"); // cache for 5s
}

export async function getSlippyLatest(req, res) {
    const geoFragmenter = new SlippyFragmenter();
    await getLatest(req, res, geoFragmenter);
}

export async function getGeohashLatest(req, res) {
    const geoFragmenter = new GeohashFragmenter();
    await getLatest(req, res, geoFragmenter);
}

export async function getH3Latest(req, res) {
    const geoFragmenter = new H3Fragmenter();
    await getLatest(req, res, geoFragmenter);
}

/*
 * Placeholders
 * There are probably libraries that automate the mutating of contexts
 * Ideally these functions create and use a new vocabulary combining the original data and the derived view
 */

function extractVocubalary(data) {
    // fixme; simple placeholder
    if (data && data.length) {
        return data[0]["@context"];
    } else {
        return {};
    }
}

function expandVocabulary(vocabulary) {
    let targetContext;
    if (vocabulary && vocabulary.length) {
        targetContext = vocabulary[0];
    } else {
        targetContext = vocabulary;
    }

    targetContext["schema"] = "http://schema.org/"; // for the endDate
    targetContext["dcterms"] = "http://purl.org/dc/terms/"; // to describe the dataset
    targetContext["tiles"] = "https://w3id.org/tree/terms#"; // for the fragmentations
    targetContext["hydra"] = "http://www.w3.org/ns/hydra/core#"; // for the hypermedia controls
    targetContext["hydra:variableRepresentation"] = {
        "@type": "@id",
    };
    targetContext["hydra:property"] = {
        "@type": "@id",
    };
}

function simplifyGraph(vocabulary, graph) {
    // fixme; simple placeholder
    for (const entity of graph) {
        delete entity["@context"];
    }
}