const fs = require('fs/promises');
const path = require('path');

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const CONTENTS_API = 'https://api.github.com/repos';

function json(res, status, payload) {
    res.status(status).setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
}

function githubConfig() {
    const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } = process.env;
    if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) return null;
    return { token: GITHUB_TOKEN, owner: GITHUB_OWNER, repo: GITHUB_REPO };
}

function githubUrl(config, filePath) {
    return `${CONTENTS_API}/${config.owner}/${config.repo}/contents/${filePath}`;
}

async function githubRequest(config, filePath, options = {}) {
    const response = await fetch(githubUrl(config, filePath), {
        ...options,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${config.token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            ...(options.headers || {})
        }
    });

    if (!response.ok) {
        const message = await response.text();
        throw new Error(`GitHub request failed (${response.status}): ${message}`);
    }

    return response.json();
}

function decodeGithubFile(file) {
    return Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');
}

async function readLocalArticles() {
    try {
        const source = await fs.readFile(path.join(process.cwd(), 'articles', 'articles.json'), 'utf8');
        return JSON.parse(source);
    } catch (error) {
        return [];
    }
}

async function readArticles(config) {
    if (!config) return readLocalArticles();

    try {
        const file = await githubRequest(config, 'articles/articles.json');
        return JSON.parse(decodeGithubFile(file));
    } catch (error) {
        return readLocalArticles();
    }
}

function slugify(value) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 70) || 'article';
}

function safeImageExtension(name, type) {
    const extension = path.extname(name || '').toLowerCase();
    if (/^\.(png|jpe?g|webp|gif)$/i.test(extension)) return extension;
    if (type === 'image/png') return '.png';
    if (type === 'image/webp') return '.webp';
    if (type === 'image/gif') return '.gif';
    return '.jpg';
}

async function commitFile(config, filePath, content, message, sha) {
    return githubRequest(config, filePath, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) })
    });
}

async function saveToGithub(config, articles, image) {
    const articleFile = await githubRequest(config, 'articles/articles.json').catch(() => null);
    await commitFile(
        config,
        'articles/articles.json',
        Buffer.from(JSON.stringify(articles, null, 2)).toString('base64'),
        `Add article: ${articles[0].title}`,
        articleFile && articleFile.sha
    );

    if (image) {
        const imageFile = `images/articles/${image.filename}`;
        const existingImage = await githubRequest(config, imageFile).catch(() => null);
        await commitFile(
            config,
            imageFile,
            image.base64,
            `Add article image: ${image.filename}`,
            existingImage && existingImage.sha
        );
    }
}

module.exports = async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const articles = await readArticles(githubConfig());
            return json(res, 200, articles.sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)));
        } catch (error) {
            return json(res, 500, { error: 'Articles could not be loaded.' });
        }
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return json(res, 405, { error: 'Method not allowed.' });
    }

    if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
        return json(res, 401, { error: 'Invalid admin password.' });
    }

    const { title, description, category, date, time, image } = req.body || {};
    if (!title || !description || !date || !time) {
        return json(res, 400, { error: 'Title, description, date, and time are required.' });
    }

    if (image && (!image.base64 || !image.type || !image.name)) {
        return json(res, 400, { error: 'The uploaded image is invalid.' });
    }

    const imageBytes = image ? Buffer.from(image.base64, 'base64').length : 0;
    if (imageBytes > MAX_IMAGE_BYTES) {
        return json(res, 413, { error: 'Images must be 3 MB or smaller.' });
    }

    const config = githubConfig();
    if (!config) return json(res, 500, { error: 'GitHub storage is not configured yet.' });

    try {
        const articles = await readArticles(config);
        const id = `${slugify(title)}-${Date.now()}`;
        const imageFilename = image ? `${id}${safeImageExtension(image.name, image.type)}` : '';
        const article = {
            id,
            title: title.trim(),
            description: description.trim(),
            category: (category || 'Observation').trim(),
            date,
            time,
            day: new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(`${date}T${time}:00+05:30`)),
            image: imageFilename ? `images/articles/${imageFilename}` : ''
        };

        const imageToCommit = imageFilename ? { ...image, filename: imageFilename } : null;
        await saveToGithub(config, [article, ...articles], imageToCommit);
        return json(res, 201, article);
    } catch (error) {
        console.error(error);
        return json(res, 502, { error: 'The article could not be saved to GitHub.' });
    }
};
