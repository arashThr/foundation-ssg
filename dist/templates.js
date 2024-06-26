import * as Post from './post.js';
import * as fs from "fs/promises";
import { join, basename, dirname, extname } from 'path';
function xmlEscape(text) {
    const escapes = {
        '"': '&quot',
        "'": '&apos',
        '<': '&lt',
        '>': '&gt',
        '&': '&amp'
    };
    const re = new RegExp('[' + Object.keys(escapes).join('') + ']', 'g');
    return text.toString().replace(re, (c) => escapes[c]);
}
async function getFiles(dir) {
    let files = [];
    for (let f of await fs.readdir(dir)) {
        const path = join(dir, f);
        let fileStat = await fs.stat(path);
        if (fileStat.isDirectory())
            files.push(...await getFiles(path));
        else
            files.push(path);
    }
    return files;
}
export class TemplateEngine {
    includes = new Map();
    filePath;
    constructor(filePath) {
        // Remove "site/dir" directory from the path
        this.filePath = join(...filePath.split('/').slice(3));
    }
    async init() {
        const includeFiles = await getFiles('./site/include');
        for (let f of includeFiles) {
            const content = await fs.readFile(f, 'utf-8');
            this.includes.set(basename(f), content);
        }
    }
    renderHtml(template, siteData = {}) {
        let args = Object.keys(siteData).join();
        let params = Object.values(siteData);
        let code = `const xmlEscape = ${xmlEscape.toString()};
        return (${args}) => { let output = '';\n`;
        for (let l of template.split('\n')) {
            if (l.match(/^\s*% (.*)/)) {
                code += l.includes('% include')
                    ? this.addIncludedHtml(l, siteData)
                    : l.trim().slice(1) + '\n';
            }
            else {
                code += 'output += `' + l + '\\n`;\n';
            }
        }
        code += 'return output; }';
        let func = Function(code)();
        return func(...params);
    }
    addIncludedHtml(l, siteData) {
        let m = l.match(/% include (\S+.html)/);
        if (!m)
            throw new Error('"Include" matching failed: ' + l);
        const template = this.includes.get(m[1]);
        if (!template)
            throw new Error(`${m[1]} template not found`);
        const renderedTemplate = this.renderHtml(template, siteData);
        return 'output += `' + renderedTemplate + '\\n`;\n';
    }
}
/**
 * `PostEngine` is just `TemplateEngine` that also applies __layouts__
 */
export class PostEngine extends TemplateEngine {
    updateCache;
    layouts = new Map();
    constructor(filePath, updateCache = true) {
        super(filePath);
        this.updateCache = updateCache;
    }
    // TODO: Experimental use of parallel run
    async init() {
        await super.init();
        const layoutFiles = (await getFiles('./site/layout')).filter(f => extname(f) === '.html');
        let p = [];
        for (let f of layoutFiles) {
            p.push(new Promise(resolve => {
                resolve(fs.readFile(f, 'utf-8'));
            }).then(content => {
                this.layouts.set(basename(f, '.html'), content);
            }));
        }
        await Promise.all(p);
    }
    getLayout(layoutName) {
        const layout = this.layouts.get(layoutName);
        if (!layout)
            throw new Error(`${layoutName} layout is undefined`);
        return layout;
    }
    renderPost(content, siteData) {
        const [date, fileName] = Post.parsePostFileName(this.filePath);
        const url = join(dirname(this.filePath), fileName);
        const [fms, postTemplate] = Post.getSections(content);
        const postData = Post.parseFrontMatter(fms, date, fileName);
        // const postTemplate = Post.convertMarkdown(mds)
        let data = Object.assign({ post: postData }, siteData);
        const postHtml = this.renderHtml(postTemplate, data);
        data = Object.assign({ content: postHtml }, data);
        const layout = this.getLayout(postData.layout);
        const fullHtml = this.renderHtml(layout, data);
        return [fullHtml, postData, url + '.html'];
    }
}
