'use strict';

const state = { deck: null, media: null, slides: [], index: 0, toc: [] };
const $ = id => document.getElementById(id);
const position = (node, box) => {
  const [x, y, width, height] = box;
  Object.assign(node.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
};

function textElement(element, localOffset = [0, 0]) {
  const node = document.createElement(element.href ? 'a' : 'div');
  node.className = `element text ${element.role === 'source-link' ? 'source-link' : ''}`;
  node.textContent = element.text;
  const [x, y, w, h] = element.box;
  position(node, [x - localOffset[0], y - localOffset[1], w, h]);
  Object.assign(node.style, {
    fontSize: `${element.pt}pt`, fontWeight: element.bold ? '700' : '400',
    color: element.color, textAlign: element.align || 'left'
  });
  if (element.href) {
    node.href = element.href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  return node;
}

function placeholderElement(element) {
  const node = document.createElement('div');
  node.className = 'element media-frame';
  node.dataset.mediaId = element.mediaId;
  node.setAttribute('role', 'group');
  node.setAttribute('aria-label', element.title);
  position(node, element.box);
  for (const label of element.labels) {
    const text = textElement(label, element.box);
    text.classList.add('media-label');
    node.append(text);
  }
  return node;
}

function mediaUrl(src) {
  if (!src || typeof src !== 'string') return null;
  const base = src.startsWith('sources/') ? state.media.repositoryBaseUrl : document.baseURI;
  const url = new URL(src, base);
  return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
}

function hydrateMedia(slide) {
  for (const frame of slide.querySelectorAll('[data-media-id]')) {
    if (frame.dataset.loaded) continue;
    const entry = state.media.slots[frame.dataset.mediaId];
    if (!entry) continue;
    const sources = Array.isArray(entry.srcs) && entry.srcs.length ? entry.srcs : [entry.src];
    const urls = sources.map(source => {
      try { return mediaUrl(source); } catch { return null; }
    }).filter(Boolean);
    if (!urls.length || !['image', 'video'].includes(entry.type)) continue;
    frame.dataset.loaded = 'true';
    const gallery = urls.length > 1 && entry.type === 'image';
    if (gallery) frame.classList.add('media-gallery');
    let failures = 0;
    for (const src of urls) {
      const asset = document.createElement(entry.type === 'video' ? 'video' : 'img');
      asset.style.objectFit = entry.fit === 'cover' ? 'cover' : 'contain';
      if (entry.type === 'video') {
        asset.controls = true;
        asset.playsInline = true;
        asset.preload = 'none';
        asset.setAttribute('aria-label', entry.alt || frame.getAttribute('aria-label'));
      } else {
        asset.alt = entry.alt || frame.getAttribute('aria-label');
        asset.decoding = 'async';
      }
      const reveal = () => {
        for (const label of frame.querySelectorAll('.media-label')) label.hidden = true;
      };
      asset.addEventListener(entry.type === 'video' ? 'loadedmetadata' : 'load', reveal, { once: true });
      asset.addEventListener('error', () => {
        asset.remove();
        if (++failures === urls.length) {
          for (const label of frame.querySelectorAll('.media-label')) label.hidden = false;
          const error = document.createElement('p');
          error.className = 'media-error';
          error.textContent = '미디어를 불러올 수 없습니다.';
          frame.append(error);
        }
      }, { once: true });
      asset.src = src;
      frame.append(asset);
    }
  }
}

function fitStage() {
  const rect = $('viewport').getBoundingClientRect();
  const scale = Math.max(0.1, Math.min(rect.width / 960, rect.height / 540));
  $('stage').style.transform = `scale(${scale})`;
}

function closeContents() {
  $('contents').hidden = true;
  $('contents-button').setAttribute('aria-expanded', 'false');
}

function showSlide(nextIndex, updateHash = true) {
  const index = Math.max(0, Math.min(state.slides.length - 1, nextIndex));
  if (!Number.isFinite(index)) return;
  const previous = state.slides[state.index];
  if (previous && state.index !== index) {
    for (const video of previous.querySelectorAll('video')) video.pause();
  }
  state.index = index;
  state.slides.forEach((slide, i) => { slide.hidden = i !== index; });
  state.toc.forEach((button, i) => { button.setAttribute('aria-current', String(i === index)); });
  $('counter').textContent = `${String(index + 1).padStart(2, '0')} / ${state.slides.length}`;
  $('previous').disabled = index === 0;
  $('next').disabled = index === state.slides.length - 1;
  document.title = `${index + 1} / ${state.slides.length} · 3D 테크닉 I`;
  if (updateHash) history.replaceState(null, '', `#slide-${index + 1}`);
  hydrateMedia(state.slides[index]);
}

function hashIndex() {
  const match = /^#(?:slide-)?(\d+)$/.exec(location.hash);
  return match ? Math.max(0, Number(match[1]) - 1) : 0;
}

async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch { /* Keep the normal browser presentation available. */ }
}

function bindControls() {
  $('previous').addEventListener('click', () => showSlide(state.index - 1));
  $('next').addEventListener('click', () => showSlide(state.index + 1));
  $('fullscreen').addEventListener('click', fullscreen);
  $('contents-button').addEventListener('click', () => {
    const open = $('contents').hidden;
    $('contents').hidden = !open;
    $('contents-button').setAttribute('aria-expanded', String(open));
    if (open) state.toc[state.index].scrollIntoView({ block: 'nearest' });
  });
  $('contents-close').addEventListener('click', () => { closeContents(); $('contents-button').focus(); });
  document.addEventListener('click', event => {
    if (!$('contents').hidden && !$('contents').contains(event.target) && !$('contents-button').contains(event.target)) closeContents();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closeContents(); return; }
    if (event.target.closest('input,textarea,select,video,[contenteditable="true"]')) return;
    if (['Enter', ' '].includes(event.key) && event.target.closest('button,a')) return;
    if (!state.slides.length || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!$('contents').hidden && event.target.closest('#contents')) return;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(event.key)) {
      event.preventDefault(); showSlide(state.index + 1);
    } else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(event.key)) {
      event.preventDefault(); showSlide(state.index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault(); showSlide(0);
    } else if (event.key === 'End') {
      event.preventDefault(); showSlide(state.slides.length - 1);
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault(); fullscreen();
    }
  });
  window.addEventListener('hashchange', () => showSlide(hashIndex(), false));
  document.addEventListener('fullscreenchange', () => {
    $('fullscreen').textContent = document.fullscreenElement ? '전체 화면 종료' : '전체 화면';
    fitStage();
  });
  new ResizeObserver(fitStage).observe($('viewport'));
}

async function start() {
  try {
    const responses = await Promise.all([fetch('./slides/deck.json'), fetch('./slides/media.json')]);
    if (responses.some(r => !r.ok)) throw new Error('Could not load the slide data');
    [state.deck, state.media] = await Promise.all(responses.map(r => r.json()));
    const fragment = document.createDocumentFragment();
    state.slides = state.deck.slides.map((data, index) => {
      const slide = document.createElement('section');
      slide.className = 'slide';
      slide.hidden = true;
      slide.id = data.id;
      slide.style.background = data.background;
      slide.setAttribute('aria-label', `${index + 1}. ${data.title}`);
      for (const element of data.elements) {
        if (element.kind === 'text') slide.append(textElement(element));
        else if (element.kind === 'media') slide.append(placeholderElement(element));
        else {
          const shape = document.createElement('div');
          shape.className = 'element';
          position(shape, element.box);
          shape.style.background = element.fill || 'transparent';
          if (element.border) shape.style.border = `1px solid ${element.border}`;
          shape.setAttribute('aria-hidden', 'true');
          slide.append(shape);
        }
      }
      fragment.append(slide);
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const number = document.createElement('span');
      number.className = 'toc-number'; number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('span'); title.textContent = data.title;
      button.append(number, title);
      button.addEventListener('click', () => { showSlide(index); closeContents(); $('stage').focus(); });
      li.append(button); $('contents-list').append(li); state.toc.push(button);
      return slide;
    });
    $('stage').append(fragment);
    await Promise.allSettled([document.fonts.load('400 16px Pretendard'), document.fonts.load('700 16px Pretendard')]);
    $('status').hidden = true;
    bindControls();
    showSlide(hashIndex()); fitStage();
    window.dispatchEvent(new Event('slides-ready'));
  } catch (error) {
    $('status').textContent = '슬라이드를 불러오지 못했습니다. 페이지를 새로고침해 주세요.';
    console.error(error);
  }
}

start();
