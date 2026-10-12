'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useCallback, useState } from 'react';
import { Icon } from '@/components/ui';
import { EmojiPicker } from '@/components/EmojiPicker';

function ToolbarButton({ active, onClick, title, children }: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`rte-toolbar-btn ${active ? 'active' : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="rte-toolbar-divider" />;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 120 }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const [showEmoji, setShowEmoji] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Color,
      TextStyle,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: true }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || 'Start typing…' }),
    ],
    content: value || '',
    onUpdate: ({ editor: e }: { editor: { getHTML: () => string } }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'rte-content',
        style: `min-height: ${minHeight}px`,
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const insertEmoji = useCallback((emoji: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emoji).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <ToolbarButton active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <strong>H1</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <strong>H2</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <strong>H3</strong>
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Icon name="bold" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Icon name="italic" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Icon name="strikethrough" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <Icon name="underline" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align left">
          <Icon name="align-left" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Align center">
          <Icon name="align-center" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align right">
          <Icon name="align-right" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justify">
          <Icon name="align-justify" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton active={editor.isActive('bulletList')} onClick={() => (editor.chain().focus() as any).toggleBulletList().run()} title="Bullet list">
          <Icon name="list-ul" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('orderedList')} onClick={() => (editor.chain().focus() as any).toggleOrderedList().run()} title="Numbered list">
          <Icon name="list-ol" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote">
          <Icon name="quote-left" />
        </ToolbarButton>
        <ToolbarDivider />
        <ToolbarButton active={editor.isActive('link')} onClick={setLink} title="Link">
          <Icon name="link" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          <Icon name="minus" />
        </ToolbarButton>
        <div style={{ position: 'relative' }}>
          <ToolbarButton onClick={() => setShowEmoji(!showEmoji)} title="Emoji">
            <span style={{ fontSize: 15 }}>😊</span>
          </ToolbarButton>
          {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
        </div>
        <ToolbarButton onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Clear formatting">
          <Icon name="eraser" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="rte-editor" />
    </div>
  );
}
