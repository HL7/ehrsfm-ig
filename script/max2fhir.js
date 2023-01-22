const fs = require('fs'),
    xml2js = require('xml2js');
var xml = new xml2js.Parser();

var maxroot;
xml.parseString(fs.readFileSync('ehrs_fm_r2_1-2022APR.max'), function (err, data) {
    maxroot = data;
});
// The order in the base model is wrong in some places e.g. RI.1.1.25 criteria come before the function.
// Fix the order.
sort(maxroot);

var fmid = "EHRSFMR2.1"
var reqs = { }
maxroot.model.objects.forEach(_temp => {
    _temp.object.forEach(object => {
        var parentObject;
        var fhir_parent_req;
        if (object.parentId) {
            parentObject = _temp.object.find(object2 => object2.id[0] == object.parentId[0]);
            fhir_parent_req = reqs[object.parentId[0]];
        }

        var fhir_req;
        switch (object.stereotype[0]) {
            case "HL7-FM":
                fhir_req = handleFM(object, parentObject);
                break;
            case "Section":
                fhir_req = handleSection(object, parentObject);
                break;
            case "Header":
            case "Function":
                fhir_req = handleHeaderOrFunction(object, parentObject);
                break;
            case "Criteria":
                handleCriteria(object, fhir_parent_req);
                break;
            default:
                break;
        }
        if (fhir_req) {
            reqs[object.id[0]] = fhir_req;
        }
    });
});

Object.values(reqs).forEach(req => {
    var filename = "../input/resources/Requirements-" + req.id + ".json";
    console.log(filename);
    // console.log(JSON.stringify(req, null, 2));
    fs.writeFileSync(filename, JSON.stringify(req, null, 2))
});

function handleFM(fm) {
    var title = fm.name[0];
    var name = title.replace(/[^A-Za-z0-9_]/g, '_');

    var fhir_req = {
        "resourceType": "Requirements",
        "id": fmid,
        // "url": "http://hl7.org/fhir/Requirements/" + fmid,
        "name": "FunctionalModel",
        "title": name,
        "status": "active",
      };
    return fhir_req;
}

function handleSection(section, parentObject) {
    var title = section.name[0];
    // Names should be computer friendly
    var name = title.replace(/[^A-Za-z0-9_]/g, '_');
    var alias = section.alias[0];
    var notes = section.notes[0];
    var ovidx = notes.indexOf("$OV$"); // always 4
    var exidx = notes.indexOf("$EX$");
    var acidx = notes.indexOf("$AC$");
    var overview = notes.substring(4, exidx).trim();
    var example = notes.substring(exidx+4, acidx).trim();
    if (example == "") { example = "n/a"; }
    var actors = notes.substring(acidx+4).trim();
    if (actors == "") { actors = "n/a"; }

    fhir_section = {
        "resourceType": "Requirements",
        "id": fmid + "-" + alias,
        // "url": "http://hl7.org/fhir/Requirements/" + fmid + "-" + alias,
        "name": name,
        "title": title,
        "status": "active",
        "description": overview,
      }
    return fhir_section;
}

function handleHeaderOrFunction(headerOrFunction, parentObject) {
    // some assertions
    if (headerOrFunction.notes == undefined) {
        console.error("HeaderOrFunction without notes? " + JSON.stringify(headerOrFunction));
        return;
    }

    // There are names with a '&', that gives issues in Jekyll? In title they need to be html escaped.
    var title = headerOrFunction.name[0].replace('&', '&amp;');
    // Names should be computer friendly
    var name = headerOrFunction.name[0].replace(/[^A-Za-z0-9_]/g, '_');
    var alias = headerOrFunction.alias[0];
    var notes = headerOrFunction.notes[0];
    var stidx = notes.indexOf("$ST$");
    var deidx = notes.indexOf("$DE$");
    var exidx = notes.indexOf("$EX$");
    var statement = notes.substring(4, deidx).trim();
    var description = notes.substring(deidx+4, exidx).trim();
    var example = notes.substring(exidx+4).trim();
    if (example == "") { example = "n/a"; }
    var type = "";
    switch (headerOrFunction.stereotype[0]) {
        case "Function":
            type = "F";
            break;
        case "Header":
            type = "H";
            break;
        }

    fhir_headerorfunction = {
        "resourceType": "Requirements",
        "id": fmid + "-" + alias,
        // "url": "http://hl7.org/fhir/Requirements/" + fmid + "-" + alias,
        "name": name,
        "title": title,
        "status": "active",
        "description": description,
      }
    return fhir_headerorfunction;
}

function handleCriteria(criteria, fhir_parent_req) {
    var id = criteria.id[0].replace('#','-');
    var name = criteria.name[0];
    var notes = criteria.notes[0];
    var optionality = criteria.tag.find(tag => tag['$'].name === 'Optionality');
    var conditional = criteria.tag.find(tag => tag['$'].name === 'Conditional');

    if (!fhir_parent_req) {
        console.log("parent not yet created? " + name);
        return;
    }
    var fhir_statement = {
        "key": fmid + "-" + id,
        "label": name,
        "conformance": [
          optionality['$'].value
        ],
        "conditionality": (conditional['$'].value=="Y"),
        "requirement": notes
      };
    if (!fhir_parent_req.statement) { fhir_parent_req.statement = [] };
    fhir_parent_req.statement.push(fhir_statement);
}

function sort(obj) {
    // sort by FM ID
    var section_sortkey = [];
    // EHR-S FM and UFP chapters
    section_sortkey['OV'] = '1OV';
    section_sortkey['CP'] = '2CP';
    section_sortkey['CPS'] = '3CPS';
    section_sortkey['AS'] = '4AS';
    section_sortkey['POP'] = '5POP';
    section_sortkey['RI'] = '6RI';
    section_sortkey['TI'] = '7TI';
    section_sortkey['U'] = '8U';    
    // PHR-S FM chapters
    section_sortkey['PH'] = '1PH';
    section_sortkey['S'] = '2S';
    section_sortkey['RI'] = '3RI';
    section_sortkey['TI'] = '4TI';

    obj['model'].objects[0].object.sort(function (a,b) {
        var aname = a.name;
        var bname = b.name;
        // Package should be first!
        if (a.stereotype == 'HL7-FM-ProfileDefinition' || a.stereotype == 'HL7-FM-Profile' || a.stereotype == 'HL7-FM') {
            aname = "0" + aname;
        }
        if (a.stereotype == 'HL7-FM-ProfileDefinition' || b.stereotype == 'HL7-FM-Profile' || a.stereotype == 'HL7-FM') {
            bname = "0" + bname;
        }

        if (a.stereotype == 'Section') {
            aname = section_sortkey[a.alias];
        }
        else if (a.stereotype == 'Header' || a.stereotype == 'Function') {
            var p = a.alias[0].split(/[\.]/);
            aname = section_sortkey[p[0]];
            for(var i=1; i<p.length; i++){
                aname += '.';
                var num = Number(p[i]);
                if (num<10) aname += '0';
                aname += num;
            }
        }
        else if (a.stereotype == 'Criteria') {
            var p = a.name[0].split(/[\.#]/);
            aname = section_sortkey[p[0]];
            for(var i=1; i<p.length-1; i++){
                aname += '.';
                var num = Number(p[i]);
                if (num<10) aname += '0';
                aname += num;
            }
            aname += '#';
            var cnum = Number(p[p.length-1]);
            if (cnum<10) aname += '00';
            else if (cnum<100) aname += '0';
            aname += cnum;
        }

        if (b.stereotype == 'Section') {
            bname = section_sortkey[b.alias];
        }
        else if (b.stereotype == 'Header' || b.stereotype == 'Function') {
            var p = b.alias[0].split(/[\.]/);
            bname = section_sortkey[p[0]];
            for(var i=1; i<p.length; i++){
                bname += '.';
                if (p[i]<10) bname += '0';
                bname += p[i];
            }
        }
        else if (b.stereotype == 'Criteria') {
            var p = b.name[0].split(/[\.#]/);
            bname = section_sortkey[p[0]];
            for(var i=1; i<p.length-1; i++){
                bname += '.';
                var num = Number(p[i]);
                if (num<10) bname += '0';
                bname += num;
            }
            bname += '#';
            var cnum = Number(p[p.length-1]);
            if (cnum<10) bname += '00';
            else if (cnum<100) bname += '0';
            bname += cnum;
        }
        // console.log(aname + " " + bname);
        return (aname > bname) ? 1 : -1 ;
    });    
}
