# uywng Machka

A CAT (computer-assisted translation) tool that runs in the browser but saves data locally (no accounts) and works offline.

## Functionality

### Import text in new source modal

This app does not bother with DOCX or ODT because the complexity outweighs the minimal work of a user copying and pasting their desired text into the input fields. Additionally, the user has full control over this source text directly in the editor and even if updates are made, it will try to match existing translations to the new segments after an update.

### Import MACHKA files

The tool allows users to export and import MACHKA files which are simply JSON files specifically designed for a single source, its segments, translations and memories.

### Magic story time!

Can't find a source? Simply hit the magic wand to pull in one of Aesop's fables.

### Set segmentation logic

Set the segmentation regular expression to be used (several common segmentation examples are provided). The Preview button allows you to see how the segmentation will be implemented on the source text.

### Export options

You can export to .txt, .md, html, .machka, or to the clipboard. You can also preview the final translation directly in the tool. You can choose to include or exclude any translator notes.

### Statistics about your translation

Find out some information about the source such as word count, segment count, average words per segment, and more!

### Grammar & spelling are checked

By default the grammar and spellchecker are enabled and will be enforced before saving any segment's translation. The grammar error messages are unfortunately cryptic but still indicate real errors with the grammar of your segment.

### Autocomplete words in the editor

Type anything and the editor will suggest words and you can hit enter to save the suggestion into your translation. Exclamation point shortcut to access previously created memories without using your mouse.

### Highlight and store memories

Select some text in the source and a popup will offer to save a memory for that source text. Memories are small tidbits of translated source that will be highlighted in all other source segments saving you some time typing them out again. Manage memories in the Memories tab and see what segments they are used in. Add alternative spellings to a memory to expand its usefulness across your sources.

### Basic keyboard navigation

Navigating from one translation segment to another should be three keystrokes backwards (shift-tab, enter) and two keystrokes forward (tab, enter).

### Source navigation shortcuts

You can use a series of navigation buttons to move through your translations with ease and headings can be navigated to by clicking in the expandable sidebar outline. Bookmarks can also be set on any segment to give you instant access to any location that you need with an included comment area.

### Themes and session settings

Change to another [bootswatch](https://bootswatch.com) theme or turn off some of the translation editor features and these settings will be saved in your session data. You can also backup and restore sessions which will include all of the source files currently in the tool. A local storage quota tracker is included and compression is available per-source to give you as much space as possible for your projects before having to split your work across multiple sessions.

## To Do

The project is **done**. The remaining _nice-to-have_ todos have been ordered in likelihood of completing.

- [ ]

## Development & Scripts

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app). In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.\
No testing has been setup yet for this project but PRs are welcome!

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.
