"""Tag files as 360 so social platforms show them as look-around media.

  meta360.py photo <in.jpg> <out.jpg>   add Google Photo Sphere (GPano) XMP -> Facebook 360 photo
  meta360.py video <in.mp4> <out.mp4>   add Spherical Video V1 metadata  -> YouTube / Facebook 360 video

The video tag is the 'uuid' box used by Google's spatial-media injector,
inserted into the video track; the MP4 must have its 'moov' after 'mdat'
(ffmpeg's default without +faststart) so no chunk offsets move.
"""
import struct
import sys

from PIL import Image


def photo(src: str, dst: str) -> None:
    w, h = Image.open(src).size
    xmp = (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about="" xmlns:GPano="http://ns.google.com/photos/1.0/panorama/">'
        '<GPano:ProjectionType>equirectangular</GPano:ProjectionType>'
        '<GPano:UsePanoramaViewer>True</GPano:UsePanoramaViewer>'
        f'<GPano:CroppedAreaImageWidthPixels>{w}</GPano:CroppedAreaImageWidthPixels>'
        f'<GPano:CroppedAreaImageHeightPixels>{h}</GPano:CroppedAreaImageHeightPixels>'
        f'<GPano:FullPanoWidthPixels>{w}</GPano:FullPanoWidthPixels>'
        f'<GPano:FullPanoHeightPixels>{h}</GPano:FullPanoHeightPixels>'
        '<GPano:CroppedAreaLeftPixels>0</GPano:CroppedAreaLeftPixels>'
        '<GPano:CroppedAreaTopPixels>0</GPano:CroppedAreaTopPixels>'
        '</rdf:Description></rdf:RDF></x:xmpmeta>'
    ).encode()
    payload = b'http://ns.adobe.com/xap/1.0/\x00' + xmp
    seg = b'\xff\xe1' + struct.pack('>H', len(payload) + 2) + payload
    data = open(src, 'rb').read()
    assert data[:2] == b'\xff\xd8', 'not a JPEG'
    open(dst, 'wb').write(data[:2] + seg + data[2:])


SPHERICAL_UUID = bytes.fromhex('ffcc8263f8554a938814587a02521fdd')
SPHERICAL_XML = (
    '<?xml version="1.0"?><rdf:SphericalVideo xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
    'xmlns:GSpherical="http://ns.google.com/videos/1.0/spherical/">'
    '<GSpherical:Spherical>true</GSpherical:Spherical><GSpherical:Stitched>true</GSpherical:Stitched>'
    '<GSpherical:StitchingSoftware>bedroom-3d</GSpherical:StitchingSoftware>'
    '<GSpherical:ProjectionType>equirectangular</GSpherical:ProjectionType></rdf:SphericalVideo>'
).encode()


def boxes(data: bytes, start: int, end: int):
    i = start
    while i < end:
        size, kind = struct.unpack('>I4s', data[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', data[i + 8:i + 16])[0]
            hdr = 16
        elif size == 0:
            size = end - i
        yield i, size, kind, hdr
        i += size


def video(src: str, dst: str) -> None:
    data = bytearray(open(src, 'rb').read())
    top = {k: (i, s, h) for i, s, k, h in boxes(data, 0, len(data))}
    assert b'moov' in top and b'mdat' in top and top[b'mdat'][0] < top[b'moov'][0], 'need moov after mdat'
    mi, ms, mh = top[b'moov']
    uuid = SPHERICAL_UUID + SPHERICAL_XML
    uuid_box = struct.pack('>I4s', 8 + len(uuid), b'uuid') + uuid
    for ti, ts, kind, th in boxes(data, mi + mh, mi + ms):
        if kind != b'trak':
            continue
        body = bytes(data[ti:ti + ts])
        if b'vide' not in body[:ts]:  # handler type of the video track
            continue
        insert_at = ti + ts
        data[insert_at:insert_at] = uuid_box
        struct.pack_into('>I', data, ti, ts + len(uuid_box))
        struct.pack_into('>I', data, mi, ms + len(uuid_box))
        break
    else:
        raise SystemExit('no video track found')
    open(dst, 'wb').write(data)


if __name__ == '__main__':
    mode, src, dst = sys.argv[1:4]
    (photo if mode == 'photo' else video)(src, dst)
    print('tagged', dst)
